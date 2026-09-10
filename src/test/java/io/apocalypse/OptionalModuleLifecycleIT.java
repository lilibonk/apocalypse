package io.apocalypse;

import io.apocalypse.common.exception.BizException;
import io.apocalypse.fixture.api.FixtureFacade;
import io.apocalypse.fixture.application.FixtureRuntime;
import io.apocalypse.fixture.infrastructure.persistence.FixtureMapper;
import io.apocalypse.framework.capability.CapabilityRegistry;

import java.nio.file.Path;
import java.sql.DriverManager;
import java.util.Map;
import java.util.jar.JarFile;

import org.apache.ibatis.session.SqlSessionFactory;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.server.context.WebServerApplicationContext;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.client.RestClient;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import tools.jackson.databind.JsonNode;

/** One isolated database, real host discovery and HTTP: on → off → on without data migration. */
class OptionalModuleLifecycleIT {

  @Test
  void twoModulesRestartIndependentlyWithoutLosingDataOrRoleRelationships() throws Exception {
    try (var postgres = new PostgreSQLContainer<>("postgres:18.6-alpine");
        var redis = new GenericContainer<>("redis:8.10.1-alpine").withExposedPorts(6379)) {
      postgres.start();
      redis.start();
      FixtureRuntime.RESOURCE_READS.set(0);
      String oldToken;
      String preservedDay;
      String preservedEvent;
      String eventId;
      String preservedRelationships;
      long relationCount;
      try (var enabled = start(postgres, redis, true, true)) {
        var jdbc = enabled.getBean(JdbcTemplate.class);
        jdbc.update(
            "INSERT INTO sys_menu(id,menu_name,menu_type,path,component,perms,module_key) VALUES(990001,'Fixture','M','fixture','fixture/index','fixture:status:read','fixture'),(990002,'Unknown','M','unknown','unknown/index','unknown:status:read','unknown')");
        jdbc.update("INSERT INTO sys_role_menu(role_id,menu_id) VALUES(1,990001),(1,990002)");
        oldToken = login(enabled);
        assertThat(get(enabled, "/fixture/status", oldToken).at("/data").asInt()).isEqualTo(1);
        var me = get(enabled, "/system/users/me", oldToken);
        assertThat(me.at("/data/perms").toString())
            .contains("fixture:status:read")
            .doesNotContain("unknown:status:read");
        assertThat(me.at("/data/menus").toString())
            .contains("fixture/index")
            .doesNotContain("unknown/index");
        var body =
            Map.of(
                "expectedRevisionNo",
                0,
                "operations",
                new Object[] {
                  Map.of(
                      "field",
                      "DISPLAY_LABEL",
                      "action",
                      "SET",
                      "value",
                      Map.of("text", "Lifecycle intent"))
                });
        var saved =
            client(enabled)
                .put()
                .uri("/calendar/calendars/1/personal-overrides/2026-09-10")
                .headers(headers -> headers.setBearerAuth(oldToken))
                .body(body)
                .retrieve()
                .body(JsonNode.class);
        assertThat(saved.at("/code").asInt()).as("%s", saved).isZero();
        preservedDay =
            get(enabled, "/calendar/days/2026-09-10?calendarId=1", oldToken).at("/data").toString();
        assertThat(preservedDay).contains("Lifecycle intent").contains("PERSONAL_OVERRIDE");
        var event =
            client(enabled)
                .post()
                .uri("/calendar/events")
                .headers(headers -> headers.setBearerAuth(oldToken))
                .body(
                    Map.of(
                        "calendarId",
                        "1",
                        "content",
                        Map.of(
                            "title",
                            "Lifecycle event",
                            "timeKind",
                            "ALL_DAY",
                            "startDate",
                            "2026-09-10",
                            "endDateExclusive",
                            "2026-09-11")))
                .retrieve()
                .body(JsonNode.class);
        assertThat(event.at("/code").asInt()).as("%s", event).isZero();
        eventId = event.at("/data/id").asText();
        preservedEvent = event.at("/data").toString();
        preservedRelationships =
            jdbc.queryForList(
                    "SELECT role_id, menu_id FROM sys_role_menu ORDER BY role_id, menu_id")
                .toString();
        relationCount = jdbc.queryForObject("SELECT count(*) FROM sys_role_menu", Long.class);
        assertThat(FixtureRuntime.RESOURCE_READS).hasValue(1);
      }
      try (var disabled = start(postgres, redis, false, false)) {
        assertThat(disabled.getBeanNamesForType(FixtureRuntime.class)).isEmpty();
        assertThat(
                disabled
                    .getBean(SqlSessionFactory.class)
                    .getConfiguration()
                    .hasMapper(FixtureMapper.class))
            .isFalse();
        assertThat(FixtureRuntime.RESOURCE_READS).hasValue(1);
        assertThatThrownBy(() -> disabled.getBean(FixtureFacade.class).status())
            .isInstanceOf(BizException.class);
        assertThat(get(disabled, "/fixture/status", oldToken).at("/code").asInt()).isEqualTo(40400);
        assertThat(
                get(disabled, "/calendar/days/2026-09-10?calendarId=1", oldToken)
                    .at("/code")
                    .asInt())
            .isEqualTo(40400);
        var me = get(disabled, "/system/users/me", oldToken);
        assertThat(me.at("/code").asInt()).isZero();
        assertThat(me.at("/data/perms").toString())
            .doesNotContain("fixture:")
            .doesNotContain("calendar:")
            .doesNotContain("unknown:");
        assertThat(
                disabled
                    .getBean(JdbcTemplate.class)
                    .queryForObject("SELECT count(*) FROM sys_role_menu", Long.class))
            .isEqualTo(relationCount);
        disabled.getBean(Flyway.class).validate();
        assertThat(
                disabled
                    .getBean(JdbcTemplate.class)
                    .queryForList(
                        "SELECT role_id, menu_id FROM sys_role_menu ORDER BY role_id, menu_id")
                    .toString())
            .isEqualTo(preservedRelationships);
      }
      try (var enabled = start(postgres, redis, true, true)) {
        assertThat(enabled.getBean(FixtureFacade.class).status()).isEqualTo(1);
        assertThat(FixtureRuntime.RESOURCE_READS).hasValue(2);
        assertThat(
                get(enabled, "/calendar/days/2026-09-10?calendarId=1", oldToken)
                    .at("/data")
                    .toString())
            .isEqualTo(preservedDay);
        assertThat(get(enabled, "/fixture/status", oldToken).at("/data").asInt()).isEqualTo(1);
        assertThat(get(enabled, "/calendar/events/" + eventId, oldToken).at("/data").toString())
            .isEqualTo(preservedEvent);
        assertThat(enabled.getBean(CapabilityRegistry.class).cacheDiscriminator())
            .isEqualTo("caps:v1;calendar=1;fixture=1");
        enabled.getBean(Flyway.class).validate();
      }
      try (var independent = start(postgres, redis, false, true)) {
        assertThat(independent.getBean(FixtureFacade.class).status()).isEqualTo(1);
        assertThat(
                get(independent, "/calendar/days/2026-09-10?calendarId=1", oldToken)
                    .at("/code")
                    .asInt())
            .isEqualTo(40400);
      }
      // Only this test-owned container is corrupted. No production migration is edited.
      try (var connection =
              DriverManager.getConnection(
                  postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
          var statement = connection.createStatement()) {
        assertThat(
                statement.executeUpdate(
                    "UPDATE flyway_schema_history SET checksum = checksum + 1 WHERE version = '10'"))
            .isEqualTo(1);
      }
      for (boolean enabled : new boolean[] {false, true}) {
        assertThatThrownBy(
                () -> {
                  try (var ignored = start(postgres, redis, enabled, enabled)) {
                    throw new AssertionError("Corrupt shared schema unexpectedly started");
                  }
                })
            .hasStackTraceContaining("Migration checksum mismatch");
      }
    }
    try (var jar = new JarFile(Path.of("target/apocalypse-0.0.1-SNAPSHOT.jar").toFile())) {
      assertThat(jar.stream())
          .noneMatch(
              entry ->
                  entry.getName().contains("io/apocalypse/fixture/")
                      || entry.getName().contains("classes/fixture/owned.txt"));
    }
  }

  private ConfigurableApplicationContext start(
      PostgreSQLContainer<?> postgres,
      GenericContainer<?> redis,
      boolean calendar,
      boolean fixture) {
    return new SpringApplicationBuilder(ApocalypseApplication.class)
        .run(
            "--spring.profiles.active=dev,optional-module-fixture",
            "--server.port=0",
            "--spring.datasource.url=" + postgres.getJdbcUrl(),
            "--spring.datasource.username=" + postgres.getUsername(),
            "--spring.datasource.password=" + postgres.getPassword(),
            "--spring.data.redis.host=" + redis.getHost(),
            "--spring.data.redis.port=" + redis.getMappedPort(6379),
            "--apocalypse.security.jwt.secret=lifecycle-test-only-signing-key-at-least-32-bytes",
            "--apocalypse.security.bootstrap.admin-password=TestBootstrap2026",
            "--apocalypse.capabilities.calendar.enabled=" + calendar,
            "--apocalypse.capabilities.fixture.enabled=" + fixture,
            "--apocalypse.capabilities.unknown.enabled=true");
  }

  private RestClient client(ConfigurableApplicationContext context) {
    int port = ((WebServerApplicationContext) context).getWebServer().getPort();
    return context.getBean(RestClient.Builder.class).baseUrl("http://localhost:" + port).build();
  }

  private String login(ConfigurableApplicationContext context) {
    var response =
        client(context)
            .post()
            .uri("/auth/login")
            .body(Map.of("username", "admin", "password", "TestBootstrap2026"))
            .retrieve()
            .body(JsonNode.class);
    assertThat(response.at("/code").asInt()).as("%s", response).isZero();
    return response.at("/data/accessToken").asText();
  }

  private JsonNode get(ConfigurableApplicationContext context, String path, String token) {
    return client(context)
        .get()
        .uri(path)
        .headers(headers -> headers.setBearerAuth(token))
        .retrieve()
        .body(JsonNode.class);
  }
}
