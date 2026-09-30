package io.apocalypse.framework.events;

import io.apocalypse.AbstractIntegrationTest;
import io.apocalypse.common.event.LoginFailedEvent;
import io.apocalypse.common.event.LoginSucceededEvent;
import io.apocalypse.common.event.OperLoggedEvent;
import io.apocalypse.common.event.OrderCreatedEvent;
import io.apocalypse.system.listener.LogPersistListener;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import javax.sql.DataSource;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.aop.support.AopUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.modulith.events.FailedEventPublications;
import org.springframework.modulith.events.core.EventPublicationRepository;
import org.springframework.modulith.events.core.EventPublicationRepository.FailedCriteria;
import org.springframework.modulith.events.core.PublicationTargetIdentifier;
import org.springframework.modulith.events.core.TargetEventPublication;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.event.TransactionalApplicationListenerMethodAdapter;
import org.springframework.transaction.support.TransactionTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

/** 真实 Modulith 登记/失败/重投/完成链路；仅使用 Testcontainers 合成数据。 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "apocalypse.events.recovery.initial-delay=PT24H",
      "apocalypse.events.recovery.batch-size=2",
      "apocalypse.events.recovery.max-in-flight=4",
      "apocalypse.events.recovery.max-attempts=3",
      "apocalypse.events.recovery.initial-backoff=1m",
      "apocalypse.events.recovery.max-backoff=2m",
      "apocalypse.events.recovery.stale-after=10m"
    })
class AuditRecoveryIT extends AbstractIntegrationTest {

  @Autowired private AuditEventRecovery recovery;
  @Autowired private AuditRecoveryRepository repository;
  @Autowired private AuditRecoveryProperties properties;
  @Autowired private FailedEventPublications publications;
  @Autowired private ApplicationEventPublisher publisher;
  @Autowired private PlatformTransactionManager transactions;
  @Autowired private DataSource dataSource;
  @Autowired private ApplicationContext context;
  @Autowired private MeterRegistry meters;

  @Autowired
  @Qualifier("jdbcEventPublicationRepository")
  private EventPublicationRepository delegate;

  private final List<UUID> publicationIds = new ArrayList<>();
  private final List<UUID> eventIds = new ArrayList<>();

  @AfterEach
  void cleanFixtures() {
    jdbcTemplate.execute(
        "ALTER TABLE sys_login_log DROP CONSTRAINT IF EXISTS audit_recovery_fault");
    for (UUID id : publicationIds) {
      jdbcTemplate.update("DELETE FROM event_publication WHERE id = ?", id);
    }
    for (UUID id : eventIds) {
      jdbcTemplate.update("DELETE FROM sys_login_log WHERE event_id = ?", id);
      jdbcTemplate.update("DELETE FROM sys_oper_log WHERE event_id = ?", id);
    }
  }

  @Test
  void explicitlyWrapsOriginalV2ProxyWithoutReplacingItsBean() {
    assertThat(context.getBean(EventPublicationRepository.class)).isSameAs(repository);
    assertThat(AopUtils.isAopProxy(delegate)).isTrue();
    assertThat(AopUtils.getTargetClass(delegate).getName())
        .isEqualTo("org.springframework.modulith.events.jdbc.JdbcEventPublicationRepositoryV2");
    assertThat(context.getBeansOfType(EventPublicationRepository.class))
        .containsOnlyKeys("auditRecoveryRepository", "jdbcEventPublicationRepository");
  }

  @Test
  void transientDatabaseFailureRecoversOriginalPublicationExactlyOnce() {
    LoginSucceededEvent event = event("audit_recovery_fault");
    jdbcTemplate.execute(
        "ALTER TABLE sys_login_log ADD CONSTRAINT audit_recovery_fault "
            + "CHECK (username <> 'audit_recovery_fault')");
    new TransactionTemplate(transactions)
        .executeWithoutResult(status -> publisher.publishEvent(event));
    UUID publication = findPublication(event.eventId());
    awaitStatus(publication, "FAILED");
    assertThat(rowCount(event.eventId())).isZero();

    jdbcTemplate.execute("ALTER TABLE sys_login_log DROP CONSTRAINT audit_recovery_fault");
    due(publication);
    assertThat(recovery.recoverOnce()).isEqualTo(1);
    awaitStatus(publication, "COMPLETED");
    assertThat(rowCount(event.eventId())).isEqualTo(1);
    assertThat(attempts(publication)).isEqualTo(2);
    assertThat(recovery.recoverOnce()).isZero();
    assertThat(rowCount(event.eventId())).isEqualTo(1);
  }

  @Test
  void duplicatePublicationsAndConcurrentRecoveryProduceOneAuditRow() throws Exception {
    LoginSucceededEvent event = event("audit_recovery_duplicate");
    UUID first = stage(event, "FAILED", 1);
    UUID second = stage(event, "FAILED", 1);
    AuditEventRecovery otherInstance =
        new AuditEventRecovery(
            repository,
            publications,
            dataSource,
            properties,
            new SimpleMeterRegistry(),
            Clock.systemUTC());
    CountDownLatch start = new CountDownLatch(1);
    try (var executor = Executors.newFixedThreadPool(2)) {
      Future<Integer> one =
          executor.submit(
              () -> {
                start.await();
                return recovery.recoverOnce();
              });
      Future<Integer> two =
          executor.submit(
              () -> {
                start.await();
                return otherInstance.recoverOnce();
              });
      start.countDown();
      assertThat(one.get(20, TimeUnit.SECONDS) + two.get(20, TimeUnit.SECONDS)).isEqualTo(2);
    }
    awaitStatus(first, "COMPLETED");
    awaitStatus(second, "COMPLETED");
    assertThat(rowCount(event.eventId())).isEqualTo(1);
    assertThat(attempts(first)).isEqualTo(2);
    assertThat(attempts(second)).isEqualTo(2);
  }

  @Test
  void permanentFailureExhaustsAndDoesNotStarveLaterPublications() {
    LoginSucceededEvent invalid =
        new LoginSucceededEvent(null, LocalDateTime.now(), "audit_invalid", null, null);
    UUID failing = stage(invalid, "FAILED", 1);
    assertThat(recovery.recoverOnce()).isEqualTo(1);
    awaitStatus(failing, "FAILED");
    due(failing);
    assertThat(recovery.recoverOnce()).isEqualTo(1);
    awaitStatus(failing, "FAILED");
    assertThat(attempts(failing)).isEqualTo(3);
    for (int i = 0; i < 4; i++) {
      stage(invalid, "FAILED", 3);
    }
    LoginSucceededEvent valid = event("audit_after_exhausted");
    UUID next = stage(valid, "FAILED", 1);
    assertThat(recovery.recoverOnce()).isEqualTo(1);
    awaitStatus(next, "COMPLETED");
    assertThat(rowCount(valid.eventId())).isEqualTo(1);
    assertThat(recovery.recoverOnce()).isZero();
    assertThat(attempts(failing)).isEqualTo(3);
    assertThat(meters.get("apocalypse.audit.recovery.exhausted").gauge().value())
        .isGreaterThanOrEqualTo(5);
  }

  @Test
  void retryBackoffAppliesToFailedRowsBeforeBatchLimit() {
    List<UUID> waiting = new ArrayList<>();
    for (int i = 0; i < 4; i++) {
      UUID id = stage(event("audit_waiting_" + i), "FAILED", 2);
      jdbcTemplate.update(
          "UPDATE event_publication SET last_resubmission_date = ? WHERE id = ?",
          Timestamp.from(Instant.now().minusSeconds(90)),
          id);
      waiting.add(id);
    }
    LoginSucceededEvent ready = event("audit_ready_after_waiting");
    UUID next = stage(ready, "FAILED", 1);
    assertThat(recovery.recoverOnce()).isEqualTo(1);
    awaitStatus(next, "COMPLETED");
    assertThat(waiting).allSatisfy(id -> assertThat(attempts(id)).isEqualTo(2));
  }

  @Test
  void batchSizeAndInFlightHeadroomAreEnforced() {
    List<UUID> inFlight = new ArrayList<>();
    for (int i = 0; i < 3; i++) {
      UUID id = stage(event("audit_busy_" + i), "PROCESSING", 1);
      jdbcTemplate.update(
          "UPDATE event_publication SET last_resubmission_date = now() WHERE id = ?", id);
      inFlight.add(id);
    }
    List<UUID> waiting = new ArrayList<>();
    for (int i = 0; i < 5; i++) {
      waiting.add(stage(event("audit_batch_" + i), "FAILED", 1));
    }
    assertThat(recovery.recoverOnce()).isEqualTo(1);
    await()
        .atMost(Duration.ofSeconds(10))
        .untilAsserted(
            () ->
                assertThat(waiting.stream().filter(id -> status(id).equals("COMPLETED")).count())
                    .isEqualTo(1));
    for (UUID id : inFlight) {
      jdbcTemplate.update(
          "UPDATE event_publication SET status = 'COMPLETED', completion_date = now() WHERE id = ?",
          id);
    }
    assertThat(recovery.recoverOnce()).isEqualTo(2);
    await()
        .atMost(Duration.ofSeconds(10))
        .untilAsserted(
            () ->
                assertThat(waiting.stream().filter(id -> status(id).equals("COMPLETED")).count())
                    .isEqualTo(3));
    assertThat(recovery.recoverOnce()).isEqualTo(2);
    waiting.forEach(id -> awaitStatus(id, "COMPLETED"));
  }

  @Test
  void staleInterruptedPublicationRecoversButUnrelatedEventRemainsUntouched() {
    LoginSucceededEvent event = event("audit_interrupted");
    UUID interrupted = stage(event, "RESUBMITTED", 2);
    UUID unrelated = UUID.randomUUID();
    publicationIds.add(unrelated);
    jdbcTemplate.update(
        """
        INSERT INTO event_publication (id, listener_id, event_type, serialized_event,
          publication_date, status, completion_attempts, last_resubmission_date)
        VALUES (?, 'unrelated-listener', ?, '{}', now() - interval '1 hour', 'FAILED', 1,
          now() - interval '1 hour')
        """,
        unrelated,
        OrderCreatedEvent.class.getName());
    assertThat(recovery.recoverOnce()).isEqualTo(1);
    awaitStatus(interrupted, "COMPLETED");
    assertThat(rowCount(event.eventId())).isEqualTo(1);
    assertThat(status(unrelated)).isEqualTo("FAILED");
    assertThat(attempts(unrelated)).isEqualTo(1);
  }

  @Test
  void legacyNullStateAndAttemptCountCanRecover() {
    LoginSucceededEvent event = event("audit_legacy_nulls");
    UUID legacy = stage(event, "FAILED", 1);
    jdbcTemplate.update(
        "UPDATE event_publication SET status = NULL, completion_attempts = NULL, "
            + "last_resubmission_date = NULL WHERE id = ?",
        legacy);
    assertThat(recovery.recoverOnce()).isEqualTo(1);
    awaitStatus(legacy, "COMPLETED");
    assertThat(attempts(legacy)).isEqualTo(2);
    assertThat(rowCount(event.eventId())).isEqualTo(1);
  }

  @Test
  void staleSweepDoesNotOverwriteConcurrentFreshResubmission() throws Exception {
    UUID id = stage(event("audit_stale_race"), "PROCESSING", 1);
    try (Connection connection = dataSource.getConnection();
        var executor = Executors.newSingleThreadExecutor()) {
      connection.setAutoCommit(false);
      int backend;
      try (var statement = connection.createStatement();
          var result = statement.executeQuery("SELECT pg_backend_pid()")) {
        result.next();
        backend = result.getInt(1);
      }
      try (PreparedStatement update =
          connection.prepareStatement(
              "UPDATE event_publication SET status = 'RESUBMITTED', last_resubmission_date = now() WHERE id = ?")) {
        update.setObject(1, id);
        update.executeUpdate();
      }
      Future<?> sweep = executor.submit(() -> repository.expireStale(Instant.now()));
      try {
        await()
            .atMost(Duration.ofSeconds(10))
            .untilAsserted(
                () ->
                    assertThat(
                            jdbcTemplate.queryForObject(
                                "SELECT COUNT(*) FROM pg_stat_activity "
                                    + "WHERE ? = ANY(pg_blocking_pids(pid))",
                                Integer.class,
                                backend))
                        .isPositive());
        connection.commit();
        sweep.get(10, TimeUnit.SECONDS);
        assertThat(status(id)).isEqualTo("RESUBMITTED");
      } finally {
        connection.rollback();
      }
    }
  }

  @Test
  void recoveryRejectsAnOuterBusinessTransaction() {
    assertThatThrownBy(
            () ->
                new TransactionTemplate(transactions)
                    .executeWithoutResult(status -> recovery.recoverOnce()))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("业务事务之外");
  }

  @Test
  void malformedPayloadIsRetainedWithoutPoisoningNextBatch() {
    UUID broken = stage(event("audit_broken_payload"), "FAILED", 1);
    jdbcTemplate.update(
        "UPDATE event_publication SET serialized_event = 'not-json' WHERE id = ?", broken);
    LoginSucceededEvent next = event("audit_after_broken");
    UUID valid = stage(next, "FAILED", 1);
    assertThat(recovery.recoverOnce()).isEqualTo(1);
    awaitStatus(valid, "COMPLETED");
    assertThat(attempts(broken)).isEqualTo(3);
    assertThat(status(broken)).isEqualTo("FAILED");
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT serialized_event FROM event_publication WHERE id = ?",
                String.class,
                broken))
        .isEqualTo("not-json");
  }

  @Test
  void missingListenerFailsWithoutHoldingUncommittedClaimOrBlockingOtherEvents() {
    UUID missing = stage(event("audit_missing_listener"), "FAILED", 1);
    jdbcTemplate.update(
        "UPDATE event_publication SET listener_id = 'missing-listener' WHERE id = ?", missing);
    UUID good = stage(event("audit_after_missing_listener"), "FAILED", 1);
    assertThat(recovery.recoverOnce()).isEqualTo(2);
    awaitStatus(missing, "FAILED");
    awaitStatus(good, "COMPLETED");
  }

  @Test
  void databaseLockHeldByAnotherConnectionSkipsWithoutClaiming() throws Exception {
    UUID waiting = stage(event("audit_waiting_for_lock"), "FAILED", 1);
    try (Connection connection = dataSource.getConnection()) {
      advisory(connection, "pg_advisory_lock");
      try {
        assertThat(recovery.recoverOnce()).isZero();
        assertThat(attempts(waiting)).isEqualTo(1);
      } finally {
        advisory(connection, "pg_advisory_unlock");
      }
    }
    assertThat(recovery.recoverOnce()).isEqualTo(1);
    awaitStatus(waiting, "COMPLETED");
  }

  @Test
  void failedLoginAndOperationEventsUseTheSameBoundedRecovery() {
    UUID failedId = UUID.randomUUID();
    UUID operationId = UUID.randomUUID();
    eventIds.add(failedId);
    eventIds.add(operationId);
    UUID failed =
        stage(
            new LoginFailedEvent(
                failedId,
                LocalDateTime.now(),
                "audit_failed_login",
                "127.0.0.1",
                "test",
                "synthetic failure"),
            "onLoginFailed",
            "FAILED",
            1);
    UUID operation =
        stage(
            new OperLoggedEvent(
                operationId,
                LocalDateTime.now(),
                "audit_operation",
                "TEST",
                "audit.test",
                "synthetic",
                "127.0.0.1",
                "{}",
                "{}",
                1,
                null,
                1L),
            "onOperLogged",
            "FAILED",
            1);
    assertThat(recovery.recoverOnce()).isEqualTo(2);
    awaitStatus(failed, "COMPLETED");
    awaitStatus(operation, "COMPLETED");
    assertThat(rowCount(failedId)).isEqualTo(1);
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_oper_log WHERE event_id = ?", Integer.class, operationId))
        .isEqualTo(1);
  }

  @Test
  void completedPublicationCannotBeClaimedAfterSelection() {
    UUID id = stage(event("audit_completed_race"), "FAILED", 1);
    repository.recover(
        Instant.now(),
        () -> {
          assertThat(repository.findFailedPublications(FailedCriteria.ALL))
              .extracting(TargetEventPublication::getIdentifier)
              .contains(id);
          jdbcTemplate.update(
              "UPDATE event_publication SET status = 'COMPLETED', completion_date = now() WHERE id = ?",
              id);
          assertThat(repository.markResubmitted(id, Instant.now())).isFalse();
        });
    assertThat(attempts(id)).isEqualTo(1);
    assertThat(status(id)).isEqualTo("COMPLETED");
  }

  @Test
  void dispatchExceptionReleasesSessionLockAndScopeForNextInstance() {
    UUID waiting = stage(event("audit_after_dispatch_exception"), "FAILED", 1);
    AuditEventRecovery failing =
        new AuditEventRecovery(
            repository,
            options -> {
              throw new IllegalStateException("synthetic dispatch failure");
            },
            dataSource,
            properties,
            new SimpleMeterRegistry(),
            Clock.systemUTC());
    assertThatThrownBy(failing::recoverOnce).isInstanceOf(IllegalStateException.class);
    assertThat(recovery.recoverOnce()).isEqualTo(1);
    awaitStatus(waiting, "COMPLETED");
  }

  private LoginSucceededEvent event(String username) {
    UUID id = UUID.randomUUID();
    eventIds.add(id);
    return new LoginSucceededEvent(id, LocalDateTime.now(), username, "127.0.0.1", "audit-test");
  }

  private UUID stage(LoginSucceededEvent event, String status, int attempts) {
    return stage(event, "onLoginSucceeded", status, attempts);
  }

  private UUID stage(Object event, String methodName, String status, int attempts) {
    try {
      var method = LogPersistListener.class.getMethod(methodName, event.getClass());
      String listener =
          new TransactionalApplicationListenerMethodAdapter(
                  "logPersistListener", LogPersistListener.class, method)
              .getListenerId();
      TargetEventPublication stored =
          delegate.create(
              TargetEventPublication.of(
                  event,
                  PublicationTargetIdentifier.of(listener),
                  Instant.now().minusSeconds(3600)));
      UUID id = stored.getIdentifier();
      publicationIds.add(id);
      jdbcTemplate.update(
          "UPDATE event_publication SET status = ?, completion_attempts = ? WHERE id = ?",
          status,
          attempts,
          id);
      return id;
    } catch (NoSuchMethodException exception) {
      throw new AssertionError(exception);
    }
  }

  private UUID findPublication(UUID eventId) {
    UUID id =
        jdbcTemplate.queryForObject(
            "SELECT id FROM event_publication WHERE serialized_event LIKE ?",
            UUID.class,
            "%" + eventId + "%");
    publicationIds.add(id);
    return id;
  }

  private void due(UUID id) {
    jdbcTemplate.update(
        "UPDATE event_publication SET last_resubmission_date = now() - interval '1 hour' WHERE id = ?",
        id);
  }

  private int rowCount(UUID id) {
    return jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM sys_login_log WHERE event_id = ?", Integer.class, id);
  }

  private int attempts(UUID id) {
    return jdbcTemplate.queryForObject(
        "SELECT completion_attempts FROM event_publication WHERE id = ?", Integer.class, id);
  }

  private String status(UUID id) {
    return jdbcTemplate.queryForObject(
        "SELECT status FROM event_publication WHERE id = ?", String.class, id);
  }

  private void awaitStatus(UUID id, String expected) {
    await()
        .atMost(Duration.ofSeconds(15))
        .untilAsserted(() -> assertThat(status(id)).isEqualTo(expected));
  }

  private static void advisory(Connection connection, String function) throws Exception {
    try (PreparedStatement statement =
        connection.prepareStatement("SELECT " + function + "(?, ?)")) {
      statement.setInt(1, AuditEventRecovery.LOCK_NAMESPACE);
      statement.setInt(2, AuditEventRecovery.LOCK_ID);
      statement.execute();
    }
  }
}
