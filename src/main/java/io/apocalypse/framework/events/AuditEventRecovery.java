package io.apocalypse.framework.events;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicLong;
import javax.sql.DataSource;

import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.modulith.events.FailedEventPublications;
import org.springframework.modulith.events.ResubmissionOptions;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.Assert;

import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;

/** 用独立 PostgreSQL 会话锁协调各实例，领取立即提交，消费者继续由 Modulith 管理。 */
@Slf4j
public class AuditEventRecovery {

  static final int LOCK_NAMESPACE = 20260927;

  static final int LOCK_ID = 149;

  private final AuditRecoveryRepository repository;

  private final FailedEventPublications publications;

  private final DataSource dataSource;

  private final AuditRecoveryProperties properties;

  private final MeterRegistry meters;

  private final Clock clock;

  private final AtomicLong pending = new AtomicLong();

  private final AtomicLong inFlight = new AtomicLong();

  private final AtomicLong exhausted = new AtomicLong();

  private final AtomicLong oldestSeconds = new AtomicLong();

  private final AtomicLong lastSuccess = new AtomicLong();

  public AuditEventRecovery(
      AuditRecoveryRepository repository,
      FailedEventPublications publications,
      DataSource dataSource,
      AuditRecoveryProperties properties,
      MeterRegistry meters,
      Clock clock) {
    this.repository = repository;
    this.publications = publications;
    this.dataSource = dataSource;
    this.properties = properties;
    this.meters = meters;
    this.clock = clock;
    meters.gauge("apocalypse.audit.recovery.pending", pending);
    meters.gauge("apocalypse.audit.recovery.in.flight", inFlight);
    meters.gauge("apocalypse.audit.recovery.exhausted", exhausted);
    meters.gauge("apocalypse.audit.recovery.oldest.seconds", oldestSeconds);
    meters.gauge("apocalypse.audit.recovery.last.success.epoch.seconds", lastSuccess);
  }

  @Scheduled(
      fixedDelayString = "${apocalypse.events.recovery.delay:PT30S}",
      initialDelayString = "${apocalypse.events.recovery.initial-delay:PT30S}")
  public void recover() {
    try {
      recoverOnce();
    } catch (RuntimeException failure) {
      meters.counter("apocalypse.audit.recovery.runs", "outcome", "failed").increment();
      // JDBC 异常可能携带序列化参数，不记录异常内容。
      log.warn("审计恢复本轮失败，后续轮询将重试: errorType={}", failure.getClass().getSimpleName());
    }
  }

  /** 内部运行入口，便于故障验收；无外部 HTTP/API 暴露。 */
  public int recoverOnce() {
    Assert.state(!TransactionSynchronizationManager.isActualTransactionActive(), "审计恢复必须在业务事务之外运行");
    int claimed = dispatchWithLock();
    if (claimed < 0) {
      meters.counter("apocalypse.audit.recovery.runs", "outcome", "lock_skipped").increment();
      return 0;
    }
    Instant now = clock.instant();
    AuditRecoveryRepository.Snapshot snapshot = repository.snapshot(now);
    pending.set(snapshot.pending());
    inFlight.set(snapshot.inFlight());
    exhausted.set(snapshot.exhausted());
    oldestSeconds.set(snapshot.oldestSeconds());
    lastSuccess.set(now.getEpochSecond());
    meters.counter("apocalypse.audit.recovery.runs", "outcome", "completed").increment();
    meters.counter("apocalypse.audit.recovery.resubmitted").increment(claimed);
    return claimed;
  }

  private int dispatchWithLock() {
    // 不在外层事务内领取：Modulith 的同步失败处理使用 REQUIRES_NEW，否则会等待本轮自身的行锁。
    try (Connection connection = dataSource.getConnection()) {
      boolean acquired;
      try {
        acquired = lock(connection, "pg_try_advisory_lock");
      } catch (SQLException failure) {
        // 获锁结果未知（例如成功后的应答丢失）时也不能把会话归还连接池。
        connection.abort(Runnable::run);
        throw failure;
      }
      if (!acquired) {
        return -1;
      }
      try {
        Instant now = clock.instant();
        repository.expireStale(now);
        long available = properties.maxInFlight() - repository.snapshot(now).inFlight();
        return available <= 0
            ? 0
            : repository.recover(
                now,
                () ->
                    publications.resubmit(
                        ResubmissionOptions.defaults()
                            .withBatchSize((int) Math.min(properties.batchSize(), available))
                            .withMaxInFlight(properties.maxInFlight())));
      } finally {
        try {
          if (!lock(connection, "pg_advisory_unlock")) {
            throw new SQLException("审计恢复会话锁已丢失");
          }
        } catch (SQLException failure) {
          // 不得把可能仍持有会话锁的连接归还连接池。
          connection.abort(Runnable::run);
          throw failure;
        }
      }
    } catch (SQLException failure) {
      throw new DataAccessResourceFailureException("审计恢复协调连接失败", failure);
    }
  }

  private static boolean lock(Connection connection, String function) throws SQLException {
    try (PreparedStatement statement =
        connection.prepareStatement("SELECT " + function + "(?, ?)")) {
      statement.setInt(1, LOCK_NAMESPACE);
      statement.setInt(2, LOCK_ID);
      statement.setQueryTimeout(15);
      try (ResultSet result = statement.executeQuery()) {
        return result.next() && result.getBoolean(1);
      }
    }
  }
}
