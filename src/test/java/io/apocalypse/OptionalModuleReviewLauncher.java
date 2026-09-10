package io.apocalypse;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;

import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.server.context.WebServerApplicationContext;
import org.springframework.http.HttpMethod;
import org.springframework.web.client.RestClient;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;

import com.github.dockerjava.api.model.ExposedPort;
import com.github.dockerjava.api.model.PortBinding;
import com.github.dockerjava.api.model.Ports;

import tools.jackson.databind.JsonNode;

/**
 * Local human-review harness. Always creates its own disposable DB/Redis, never reuses dev data.
 */
public final class OptionalModuleReviewLauncher {
  private OptionalModuleReviewLauncher() {}

  public static void main(String[] args) throws InterruptedException {
    try (var postgres = new PostgreSQLContainer<>("postgres:18.6-alpine");
        var redis = new GenericContainer<>("redis:8.10.1-alpine").withExposedPorts(6379)) {
      loopback(postgres, 5432);
      loopback(redis, 6379);
      postgres.start();
      redis.start();
      try (var application =
          new SpringApplicationBuilder(ApocalypseApplication.class)
              .run(
                  "--spring.profiles.active=dev",
                  "--server.address=127.0.0.1",
                  "--server.port=0",
                  "--spring.datasource.url=" + postgres.getJdbcUrl(),
                  "--spring.datasource.username=" + postgres.getUsername(),
                  "--spring.datasource.password=" + postgres.getPassword(),
                  "--spring.data.redis.host=" + redis.getHost(),
                  "--spring.data.redis.port=" + redis.getMappedPort(6379),
                  "--apocalypse.security.jwt.secret=local-review-only-signing-key-at-least-32-bytes",
                  "--apocalypse.security.bootstrap.admin-password=TestBootstrap2026",
                  "--apocalypse.capabilities.calendar.enabled=true")) {
        String url =
            "http://127.0.0.1:"
                + ((WebServerApplicationContext) application).getWebServer().getPort();
        seed(application.getBean(RestClient.Builder.class).baseUrl(url).build());
        System.out.println("OPTIONAL_MODULE_REVIEW_URL=" + url);
        new CountDownLatch(1).await();
      }
    }
  }

  private static void loopback(GenericContainer<?> container, int port) {
    container.withCreateContainerCmdModifier(
        command ->
            command
                .getHostConfig()
                .withPortBindings(
                    new PortBinding(Ports.Binding.bindIp("127.0.0.1"), new ExposedPort(port))));
  }

  private static void seed(RestClient client) {
    String token =
        call(
                client,
                HttpMethod.POST,
                "/auth/login",
                Map.of("username", "admin", "password", "TestBootstrap2026"),
                null)
            .at("/accessToken")
            .asText();
    String calendarId =
        call(
                client,
                HttpMethod.POST,
                "/calendar/calendars",
                Map.of(
                    "calendarKey",
                    "oml-local-review",
                    "name",
                    "OML 本地验收日历",
                    "parentId",
                    "1",
                    "regionCode",
                    "CN",
                    "zoneId",
                    "Asia/Shanghai"),
                token)
            .at("/id")
            .asText();
    call(
        client,
        HttpMethod.PUT,
        "/calendar/calendars/1/personal-overrides/2026-09-10",
        override("OML 本地验收 · 个人优先"),
        token);
    call(
        client,
        HttpMethod.POST,
        "/calendar/events",
        Map.of(
            "calendarId",
            "1",
            "content",
            Map.of(
                "title",
                "OML 隔离验收日程",
                "timeKind",
                "ALL_DAY",
                "startDate",
                "2026-09-10",
                "endDateExclusive",
                "2026-09-11")),
        token);
    var draft =
        call(
            client,
            HttpMethod.PUT,
            "/calendar/calendars/" + calendarId + "/managed-overrides/draft/days/2026-09-10",
            override("OML 托管发布基线"),
            token);
    call(
        client,
        HttpMethod.POST,
        "/calendar/calendars/" + calendarId + "/managed-overrides/draft/publish",
        Map.of(
            "expectedDraftVersion",
            draft.at("/version").asInt(),
            "expectedContentHash",
            draft.at("/contentHash").asText(),
            "conflictResolutions",
            List.of()),
        token);
    System.out.println("OPTIONAL_MODULE_REVIEW_CALENDAR_ID=" + calendarId);
  }

  private static Map<String, Object> override(String text) {
    return Map.of(
        "expectedRevisionNo",
        0,
        "operations",
        List.of(Map.of("field", "DISPLAY_LABEL", "action", "SET", "value", Map.of("text", text))));
  }

  private static JsonNode call(
      RestClient client, HttpMethod method, String path, Object body, String token) {
    var response =
        client
            .method(method)
            .uri(path)
            .headers(
                headers -> {
                  if (token != null) headers.setBearerAuth(token);
                })
            .body(body)
            .retrieve()
            .body(JsonNode.class);
    if (response == null || response.at("/code").asInt(-1) != 0)
      throw new IllegalStateException("Review fixture initialization failed at " + path);
    return response.at("/data");
  }
}
