package io.apocalypse;

import io.apocalypse.common.event.LoginSucceededEvent;
import io.apocalypse.common.event.OperLoggedEvent;
import io.apocalypse.system.listener.LogPersistListener;
import io.apocalypse.system.log.mapper.SysLoginLogMapper;
import io.apocalypse.system.log.mapper.SysOperLogMapper;

import java.time.LocalDateTime;
import java.util.UUID;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 审计消费幂等与失败传播回归。 */
class AuditEventIT extends AbstractIntegrationTest {

  @Autowired private SysLoginLogMapper loginLogMapper;

  @Autowired private SysOperLogMapper operLogMapper;

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
  void migrationAdoptsLegacyModulithPublicationTable() {
    String schema = "legacy_modulith_" + UUID.randomUUID().toString().replace("-", "");
    String jdbcUrl = POSTGRES.getJdbcUrl();
    try {
      Flyway.configure()
          .dataSource(jdbcUrl, POSTGRES.getUsername(), POSTGRES.getPassword())
          .schemas(schema)
          .defaultSchema(schema)
          .locations("classpath:db/migration")
          .target("4")
          .load()
          .migrate();
      jdbcTemplate.execute(
          "CREATE TABLE "
              + schema
              + ".event_publication ("
              + "id UUID NOT NULL PRIMARY KEY, listener_id TEXT NOT NULL, event_type TEXT NOT NULL, "
              + "serialized_event TEXT NOT NULL, publication_date TIMESTAMP WITH TIME ZONE NOT NULL, "
              + "completion_date TIMESTAMP WITH TIME ZONE, status TEXT, completion_attempts INT, "
              + "last_resubmission_date TIMESTAMP WITH TIME ZONE)");

      Flyway.configure()
          .dataSource(jdbcUrl, POSTGRES.getUsername(), POSTGRES.getPassword())
          .schemas(schema)
          .defaultSchema(schema)
          .locations("classpath:db/migration")
          .load()
          .migrate();

      Integer versionFive =
          jdbcTemplate.queryForObject(
              "SELECT COUNT(*) FROM "
                  + schema
                  + ".flyway_schema_history WHERE version = '5' AND success",
              Integer.class);
      assertThat(versionFive).isEqualTo(1);
    } finally {
      jdbcTemplate.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
    }
  }
}
