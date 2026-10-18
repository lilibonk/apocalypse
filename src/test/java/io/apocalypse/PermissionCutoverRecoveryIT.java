package io.apocalypse;

import io.apocalypse.framework.security.LiveAuthorizationService;
import io.apocalypse.framework.security.TokenVersionStore;

import java.net.ConnectException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.web.server.context.WebServerApplicationContext;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.core.env.MapPropertySource;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** 实际 pg_dump/pg_restore 与三次停止后启动验证：恢复数据库版本不能复活任何旧签名令牌。 */
class PermissionCutoverRecoveryIT {
  private static final String PASSWORD = "CutoverFixture2026";
  private static final String CLIENT = "cutover-monitor";
  private static final String CLIENT_SECRET = "CutoverClientFixture2026";
  private static final ObjectMapper JSON = new ObjectMapper();
  private static final HttpClient HTTP = HttpClient.newHttpClient();

  @Test
  void freshKeysFenceUserRefreshAndClientTokensAcrossRealDatabaseRestore() throws Exception {
    try (var database = new PostgreSQLContainer<>("postgres:18.6-alpine");
        var redis =
            new GenericContainer<>(DockerImageName.parse("redis:8.10.1-alpine"))
                .withExposedPorts(6379)) {
      database.start();
      redis.start();
      Tokens beforeCutover;
      long savedAuthorizationVersion;
      int retiredPort;
      try (var application = start(database, redis)) {
        retiredPort = port(application);
        beforeCutover = issue(application);
        assertUsable(application, beforeCutover);
        savedAuthorizationVersion =
            application.getBean(TokenVersionStore.class).current("admin").globalAuthorization();
      }
      assertListenerClosed(retiredPort);

      // No application instance or token issuer overlaps the dump, cutover or restore.
      assertThat(
              database
                  .execInContainer(
                      "pg_dump",
                      "-U",
                      database.getUsername(),
                      "-d",
                      database.getDatabaseName(),
                      "-Fc",
                      "-f",
                      "/tmp/permission-cutover.dump")
                  .getExitCode())
          .as("database backup")
          .isZero();

      Tokens afterCutover;
      try (var application = start(database, redis)) {
        retiredPort = port(application);
        assertRejected(application, beforeCutover);
        afterCutover = issue(application);
        assertUsable(application, afterCutover);
        application.getBean(TokenVersionStore.class).invalidateGlobalAuthorization();
        assertThat(
                application.getBean(TokenVersionStore.class).current("admin").globalAuthorization())
            .isEqualTo(savedAuthorizationVersion + 1);
      }
      assertListenerClosed(retiredPort);

      assertThat(
              database
                  .execInContainer(
                      "pg_restore",
                      "-U",
                      database.getUsername(),
                      "-d",
                      database.getDatabaseName(),
                      "--clean",
                      "--if-exists",
                      "--no-owner",
                      "--exit-on-error",
                      "/tmp/permission-cutover.dump")
                  .getExitCode())
          .as("database restore")
          .isZero();

      try (var application = start(database, redis)) {
        assertThat(
                application.getBean(TokenVersionStore.class).current("admin").globalAuthorization())
            .as("restore really returned the durable version to its previous value")
            .isEqualTo(savedAuthorizationVersion);
        assertRejected(application, beforeCutover);
        assertRejected(application, afterCutover);
        Tokens recovered = issue(application);
        assertUsable(application, recovered);
        assertThat(
                request(
                        application,
                        "/auth/refresh",
                        Map.of("refreshToken", recovered.refresh()),
                        null)
                    .path("code")
                    .asInt())
            .as("fresh login can rotate credentials after restore")
            .isZero();
      }
    }
  }

  @Test
  void unavailableAuthorizationDatabaseRejectsTheResolverAndHttpThenRecovers() throws Exception {
    try (var database = new PostgreSQLContainer<>("postgres:18.6-alpine");
        var redis =
            new GenericContainer<>(DockerImageName.parse("redis:8.10.1-alpine"))
                .withExposedPorts(6379)) {
      database.start();
      redis.start();
      try (var application = start(database, redis, true)) {
        Tokens tokens = issue(application);
        assertUsable(application, tokens);
        var identity =
            new JwtAuthenticationToken(
                application.getBean(JwtDecoder.class).decode(tokens.access()), List.of());
        var resolver = application.getBean(LiveAuthorizationService.class);
        assertThat(resolver.read(identity).executablePermissions()).contains("system:user:list");
        database.getDockerClient().pauseContainerCmd(database.getContainerId()).exec();
        try {
          assertThatThrownBy(() -> resolver.read(identity))
              .as("an unreachable real database cannot reuse a previous business grant snapshot")
              .isInstanceOf(AccessDeniedException.class);
          HttpResponse<String> response =
              raw(application, "/system/users/page?page=1&size=10", null, tokens.access());
          if (response.statusCode() == 200) {
            JsonNode body = JSON.readTree(response.body());
            assertThat(body.path("code").asInt(-1)).isGreaterThanOrEqualTo(40000);
            assertThat(body.path("data").isMissingNode() || body.path("data").isNull()).isTrue();
          } else {
            assertThat(response.statusCode()).isBetween(400, 599);
          }
        } finally {
          database.getDockerClient().unpauseContainerCmd(database.getContainerId()).exec();
        }
        assertUsable(application, tokens);
        assertThat(resolver.read(identity).executablePermissions()).contains("system:user:list");
      }
    }
  }

  private static ConfigurableApplicationContext start(
      PostgreSQLContainer<?> database, GenericContainer<?> redis) {
    return start(database, redis, false);
  }

  private static ConfigurableApplicationContext start(
      PostgreSQLContainer<?> database, GenericContainer<?> redis, boolean outageProbe) {
    byte[] key = new byte[48];
    new SecureRandom().nextBytes(key);
    Map<String, Object> settings =
        new HashMap<>(
            Map.ofEntries(
                Map.entry("server.address", "127.0.0.1"),
                Map.entry("server.port", "0"),
                Map.entry("spring.datasource.url", database.getJdbcUrl()),
                Map.entry("spring.datasource.username", database.getUsername()),
                Map.entry("spring.datasource.password", database.getPassword()),
                Map.entry("spring.data.redis.host", redis.getHost()),
                Map.entry("spring.data.redis.port", redis.getMappedPort(6379)),
                Map.entry(
                    "apocalypse.security.jwt.secret", Base64.getEncoder().encodeToString(key)),
                Map.entry("apocalypse.security.bootstrap.admin-password", PASSWORD),
                Map.entry("apocalypse.security.clients[0].client-id", CLIENT),
                Map.entry("apocalypse.security.clients[0].client-secret", CLIENT_SECRET),
                Map.entry("apocalypse.security.clients[0].scopes[0]", "management:read"),
                Map.entry("management.endpoints.web.exposure.include", "health,prometheus"),
                Map.entry("logging.level.io.apocalypse", "WARN")));
    if (outageProbe) {
      settings.put("spring.datasource.hikari.maximum-pool-size", "3");
      settings.put("spring.datasource.hikari.minimum-idle", "0");
      settings.put("spring.datasource.hikari.connection-timeout", "1000");
      settings.put("spring.datasource.hikari.validation-timeout", "500");
      settings.put("spring.datasource.hikari.data-source-properties.socketTimeout", "2");
    }
    SpringApplication application = new SpringApplication(ApocalypseApplication.class);
    application.addInitializers(
        context ->
            context
                .getEnvironment()
                .getPropertySources()
                .addFirst(new MapPropertySource("isolated-cutover", settings)));
    return application.run();
  }

  private static Tokens issue(ConfigurableApplicationContext application) throws Exception {
    JsonNode login =
        request(
            application, "/auth/login", Map.of("username", "admin", "password", PASSWORD), null);
    assertThat(login.path("code").asInt()).as("user login").isZero();
    JsonNode client =
        request(
            application,
            "/auth/token",
            Map.of("clientId", CLIENT, "clientSecret", CLIENT_SECRET),
            null);
    assertThat(client.path("code").asInt()).as("service account issuance").isZero();
    return new Tokens(
        login.at("/data/accessToken").asText(),
        login.at("/data/refreshToken").asText(),
        client.at("/data/accessToken").asText());
  }

  private static void assertUsable(ConfigurableApplicationContext app, Tokens tokens)
      throws Exception {
    assertThat(request(app, "/system/users/me", null, tokens.access()).path("code").asInt())
        .as("user access")
        .isZero();
    assertThat(raw(app, "/actuator/prometheus", null, tokens.client()).statusCode())
        .as("client management scope")
        .isEqualTo(200);
    assertThat(request(app, "/system/users/me", null, tokens.client()).path("code").asInt())
        .as("client token cannot become a user")
        .isEqualTo(40100);
  }

  private static void assertRejected(ConfigurableApplicationContext app, Tokens tokens)
      throws Exception {
    for (String token : new String[] {tokens.access(), tokens.refresh(), tokens.client()}) {
      assertThatThrownBy(() -> app.getBean(JwtDecoder.class).decode(token))
          .as("new decoder must reject every previous signing key")
          .isInstanceOf(JwtException.class);
    }
    assertUnauthorized(raw(app, "/system/users/me", null, tokens.access()), "old user signature");
    assertUnauthorized(
        raw(app, "/auth/refresh", Map.of("refreshToken", tokens.refresh()), null),
        "old refresh signature");
    assertUnauthorized(
        raw(app, "/actuator/prometheus", null, tokens.client()), "old client signature");
  }

  private static void assertUnauthorized(HttpResponse<String> response, String description) {
    // OAuth resource-server signature rejection is HTTP 401; application rejection is R/40100.
    boolean denied = response.statusCode() == 401;
    if (response.statusCode() == 200 && !response.body().isBlank()) {
      denied = JSON.readTree(response.body()).path("code").asInt(-1) == 40100;
    }
    assertThat(denied).as(description).isTrue();
  }

  private static JsonNode request(
      ConfigurableApplicationContext app, String path, Object body, String token) throws Exception {
    JsonNode result = JSON.readTree(raw(app, path, body, token).body());
    assertThat(result.has("code")).as("application response must contain an R code").isTrue();
    return result;
  }

  private static HttpResponse<String> raw(
      ConfigurableApplicationContext app, String path, Object body, String token) throws Exception {
    HttpRequest.Builder request =
        HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port(app) + path))
            .timeout(Duration.ofSeconds(15));
    if (token != null) request.header("Authorization", "Bearer " + token);
    if (body == null) {
      request.GET();
    } else {
      request.header("Content-Type", "application/json");
      request.POST(HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(body)));
    }
    return HTTP.send(request.build(), HttpResponse.BodyHandlers.ofString());
  }

  private static int port(ConfigurableApplicationContext app) {
    return ((WebServerApplicationContext) app).getWebServer().getPort();
  }

  private static void assertListenerClosed(int port) {
    assertThatThrownBy(
            () ->
                HTTP.send(
                    HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/auth/login"))
                        .timeout(Duration.ofSeconds(2))
                        .GET()
                        .build(),
                    HttpResponse.BodyHandlers.ofString()))
        .as("retired instance cannot serve requests during the cutover or restoration window")
        .isInstanceOf(ConnectException.class);
  }

  private record Tokens(String access, String refresh, String client) {}
}
