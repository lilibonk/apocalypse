package io.apocalypse;

import io.apocalypse.system.user.service.UserService;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import static org.assertj.core.api.Assertions.assertThat;

/** 固定管理员凭证回归：全量迁移默认禁用已知 V1 凭证，且不覆盖已经人工改密的管理员。 */
class BootstrapAdminIT extends AbstractIntegrationTest {

  @Autowired private UserService userService;

  @Test
  void freshMigrationLeavesLegacyAdminDisabled() {
    String schema = freshSchema("bootstrap_disabled");
    try {
      migrate(schema, null);

      Integer status =
          jdbcTemplate.queryForObject(
              "SELECT status FROM " + schema + ".sys_user WHERE username = 'admin'", Integer.class);
      String password =
          jdbcTemplate.queryForObject(
              "SELECT password FROM " + schema + ".sys_user WHERE username = 'admin'",
              String.class);
      assertThat(status).isZero();
      assertThat(password).isEqualTo("{bootstrap-disabled}");
    } finally {
      jdbcTemplate.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
    }
  }

  @Test
  void remediationDoesNotOverwriteChangedAdminPassword() {
    String schema = freshSchema("bootstrap_preserved");
    try {
      migrate(schema, "6");
      jdbcTemplate.update(
          "UPDATE "
              + schema
              + ".sys_user SET password = 'custom-private-hash' WHERE username = 'admin'");

      migrate(schema, null);

      String password =
          jdbcTemplate.queryForObject(
              "SELECT password FROM " + schema + ".sys_user WHERE username = 'admin'",
              String.class);
      Integer status =
          jdbcTemplate.queryForObject(
              "SELECT status FROM " + schema + ".sys_user WHERE username = 'admin'", Integer.class);
      assertThat(password).isEqualTo("custom-private-hash");
      assertThat(status).isEqualTo(1);
    } finally {
      jdbcTemplate.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
    }
  }

  @Test
  void concurrentBootstrapInitializationHasOneWinnerWithoutFailure() throws Exception {
    String username =
        "bootstrap_race_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    long userId =
        900_000_000_000_000_000L
            + Math.floorMod(UUID.randomUUID().getLeastSignificantBits(), 1_000_000L);
    jdbcTemplate.update(
        """
        INSERT INTO sys_user (id, username, password, nickname, status, create_by, update_by)
        VALUES (?, ?, '{bootstrap-disabled}', '并发 bootstrap', 0, 'test', 'test')
        """,
        userId,
        username);
    ExecutorService executor = Executors.newFixedThreadPool(2);
    CountDownLatch start = new CountDownLatch(1);
    try {
      Future<Boolean> first =
          executor.submit(
              () -> {
                start.await();
                return userService.initializeBootstrapAdmin(username, "RaceBootstrap2026");
              });
      Future<Boolean> second =
          executor.submit(
              () -> {
                start.await();
                return userService.initializeBootstrapAdmin(username, "RaceBootstrap2026");
              });
      start.countDown();

      assertThat(List.of(first.get(), second.get())).containsExactlyInAnyOrder(true, false);
      assertThat(
              jdbcTemplate.queryForObject(
                  "SELECT status FROM sys_user WHERE id = ?", Integer.class, userId))
          .isEqualTo(1);
    } finally {
      executor.shutdownNow();
      jdbcTemplate.update(
          "DELETE FROM security_token_version WHERE version_key = ?",
          "credential:user:" + username);
      jdbcTemplate.update("DELETE FROM sys_user WHERE id = ?", userId);
    }
  }

  private void migrate(String schema, String target) {
    var configuration =
        Flyway.configure()
            .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
            .schemas(schema)
            .defaultSchema(schema)
            .locations("classpath:db/migration");
    if (target != null) {
      configuration.target(target);
    }
    configuration.load().migrate();
  }

  private static String freshSchema(String prefix) {
    return prefix + '_' + UUID.randomUUID().toString().replace("-", "");
  }
}
