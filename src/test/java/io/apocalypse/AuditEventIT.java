package io.apocalypse;

import io.apocalypse.common.event.LoginSucceededEvent;
import io.apocalypse.common.event.OperLoggedEvent;
import io.apocalypse.system.listener.LogPersistListener;
import io.apocalypse.system.log.mapper.SysLoginLogMapper;
import io.apocalypse.system.log.mapper.SysOperLogMapper;
import io.apocalypse.system.log.service.AuditLogCleanup;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import javax.sql.DataSource;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;

/** 审计消费幂等与失败传播回归。 */
class AuditEventIT extends AbstractIntegrationTest {

  @Autowired private SysLoginLogMapper loginLogMapper;

  @Autowired private SysOperLogMapper operLogMapper;

  @Autowired private AuditLogCleanup auditLogCleanup;

  @Autowired private DataSource dataSource;

  @Test
  void duplicateDeliveryCreatesOnlyOneAuditRow() {
    UUID eventId = UUID.randomUUID();
    LoginSucceededEvent event =
        new LoginSucceededEvent(
            eventId, LocalDateTime.now(), "audit_idempotent", "127.0.0.1", "test");

    LogPersistListener listener = new LogPersistListener(loginLogMapper, operLogMapper);
    listener.onLoginSucceeded(event);
    listener.onLoginSucceeded(event);

    Integer count =
        jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM sys_login_log WHERE event_id = ?", Integer.class, eventId);
    assertThat(count).isEqualTo(1);
  }

  @Test
  void persistenceFailureIsNotSwallowed() {
    LoginSucceededEvent invalid =
        new LoginSucceededEvent(null, LocalDateTime.now(), "audit_invalid", null, null);
    LogPersistListener listener = new LogPersistListener(loginLogMapper, operLogMapper);

    assertThatThrownBy(() -> listener.onLoginSucceeded(invalid))
        .isInstanceOf(DataIntegrityViolationException.class);
  }

  @Test
  void consumerSanitizesNulAndOversizedUnicodeFields() {
    UUID eventId = UUID.randomUUID();
    String oversized = "😀".repeat(300) + '\u0000';
    LoginSucceededEvent event =
        new LoginSucceededEvent(eventId, LocalDateTime.now(), oversized, oversized, oversized);
    LogPersistListener listener = new LogPersistListener(loginLogMapper, operLogMapper);

    listener.onLoginSucceeded(event);

    Integer usernameLength =
        jdbcTemplate.queryForObject(
            "SELECT char_length(username) FROM sys_login_log WHERE event_id = ?",
            Integer.class,
            eventId);
    Integer userAgentLength =
        jdbcTemplate.queryForObject(
            "SELECT char_length(user_agent) FROM sys_login_log WHERE event_id = ?",
            Integer.class,
            eventId);
    String storedUsername =
        jdbcTemplate.queryForObject(
            "SELECT username FROM sys_login_log WHERE event_id = ?", String.class, eventId);
    assertThat(usernameLength).isEqualTo(64);
    assertThat(userAgentLength).isEqualTo(255);
    assertThat(storedUsername).doesNotContain("\u0000");
  }

  @Test
  void operationConsumerSanitizesSchemaBoundFields() {
    UUID eventId = UUID.randomUUID();
    String oversized = "x".repeat(1200) + '\u0000';
    OperLoggedEvent event =
        new OperLoggedEvent(
            eventId,
            LocalDateTime.now(),
            oversized,
            oversized,
            oversized,
            oversized,
            oversized,
            oversized,
            oversized,
            0,
            oversized,
            1L);
    LogPersistListener listener = new LogPersistListener(loginLogMapper, operLogMapper);

    listener.onOperLogged(event);

    Integer titleLength =
        jdbcTemplate.queryForObject(
            "SELECT char_length(title) FROM sys_oper_log WHERE event_id = ?",
            Integer.class,
            eventId);
    Integer errorLength =
        jdbcTemplate.queryForObject(
            "SELECT char_length(error_msg) FROM sys_oper_log WHERE event_id = ?",
            Integer.class,
            eventId);
    String storedError =
        jdbcTemplate.queryForObject(
            "SELECT error_msg FROM sys_oper_log WHERE event_id = ?", String.class, eventId);
    assertThat(titleLength).isEqualTo(64);
    assertThat(errorLength).isEqualTo(512);
    assertThat(storedError).doesNotContain("\u0000");
  }

  @Test
  void initialBaselineOwnsPublicationTableAndRepeatedMigrationPreservesEvents() {
    String schema = "initial_modulith_" + UUID.randomUUID().toString().replace("-", "");
    String jdbcUrl = POSTGRES.getJdbcUrl();
    try {
      Flyway flyway =
          Flyway.configure()
              .dataSource(jdbcUrl, POSTGRES.getUsername(), POSTGRES.getPassword())
              .schemas(schema)
              .defaultSchema(schema)
              .locations("classpath:db/migration")
              .load();
      assertThat(flyway.migrate().migrationsExecuted).isEqualTo(2);
      UUID eventId = UUID.randomUUID();
      jdbcTemplate.update(
          "INSERT INTO "
              + schema
              + ".event_publication (id, listener_id, event_type, serialized_event, publication_date)"
              + " VALUES (?, 'baseline-listener', 'baseline-event', '{}', now())",
          eventId);
      assertThat(flyway.migrate().migrationsExecuted).isZero();
      flyway.validate();

      Integer versionOne =
          jdbcTemplate.queryForObject(
              "SELECT COUNT(*) FROM "
                  + schema
                  + ".flyway_schema_history WHERE version = '1' AND success",
              Integer.class);
      assertThat(versionOne).isEqualTo(1);
      assertThat(
              jdbcTemplate.queryForObject(
                  "SELECT COUNT(*) FROM " + schema + ".event_publication WHERE id = ?",
                  Integer.class,
                  eventId))
          .isEqualTo(1);
    } finally {
      jdbcTemplate.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
    }
  }

  @Test
  void batchedCleanupDeletesExpiredLogsUnderAdvisoryLock() {
    UUID expiredEventId = UUID.randomUUID();
    UUID recentEventId = UUID.randomUUID();
    LogPersistListener listener = new LogPersistListener(loginLogMapper, operLogMapper);
    listener.onLoginSucceeded(
        new LoginSucceededEvent(
            expiredEventId,
            LocalDateTime.now().minusDays(200),
            "expired_user",
            "127.0.0.1",
            "test"));
    listener.onLoginSucceeded(
        new LoginSucceededEvent(
            recentEventId, LocalDateTime.now().minusDays(5), "recent_user", "127.0.0.1", "test"));

    auditLogCleanup.cleanup();

    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_login_log WHERE event_id = ?",
                Integer.class,
                expiredEventId))
        .isZero();
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_login_log WHERE event_id = ?",
                Integer.class,
                recentEventId))
        .isEqualTo(1);
  }

  @Test
  void cleanupCommitsFirstBatchWhileRetainingTheSessionLock() throws Exception {
    long lastId = -950_001L;
    String username = "audit_batch_" + UUID.randomUUID().toString().substring(0, 8);
    jdbcTemplate.update(
        """
        INSERT INTO sys_login_log(id, event_id, username, login_time)
        SELECT -945000 - i, gen_random_uuid(), ?, TIMESTAMP '2000-01-01' + i * interval '1 second'
        FROM generate_series(1, 5001) AS i
        """,
        username);
    try (var executor = Executors.newVirtualThreadPerTaskExecutor();
        var blockingConnection = dataSource.getConnection()) {
      blockingConnection.setAutoCommit(false);
      try (var lock =
          blockingConnection.prepareStatement(
              "SELECT id FROM sys_login_log WHERE id = ? FOR UPDATE")) {
        lock.setLong(1, lastId);
        try (var result = lock.executeQuery()) {
          assertThat(result.next()).isTrue();
        }

        var firstRun = executor.submit(auditLogCleanup::cleanup);
        try {
          await().atMost(Duration.ofSeconds(8)).until(() -> cleanupFixtureCount(username) == 1);
          // 当前批被另一连接锁住，第二个实例仍须立即跳过。
          executor.submit(auditLogCleanup::cleanup).get(2, TimeUnit.SECONDS);
          assertThat(firstRun.isDone()).isFalse();
          assertThat(cleanupFixtureCount(username)).isEqualTo(1);
        } finally {
          blockingConnection.rollback();
        }
        firstRun.get(8, TimeUnit.SECONDS);
      }
      assertThat(cleanupFixtureCount(username)).isZero();
    } finally {
      jdbcTemplate.update("DELETE FROM sys_login_log WHERE username = ?", username);
    }
  }

  private int cleanupFixtureCount(String username) {
    return jdbcTemplate.queryForObject(
        "SELECT count(*) FROM sys_login_log WHERE username = ?", Integer.class, username);
  }
}
