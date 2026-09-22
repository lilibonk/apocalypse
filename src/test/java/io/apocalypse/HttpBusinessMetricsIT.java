package io.apocalypse;

import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.R;
import io.apocalypse.framework.security.OnlineUserRegistry;
import io.apocalypse.framework.web.HttpBusinessMetrics;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;

/** 用真实 HTTP 覆盖 MVC/过滤器/异步完成分支，计数从请求完成后读取，避免仅测试标记方法。 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "apocalypse.capabilities.calendar.enabled=true")
@Import(HttpBusinessMetricsIT.ProbeConfiguration.class)
class HttpBusinessMetricsIT extends AbstractIntegrationTest {

  @Autowired private MeterRegistry meterRegistry;

  @Autowired private OnlineUserRegistry onlineUserRegistry;

  @Autowired private JwtDecoder jwtDecoder;

  @Test
  void actualLoginAndWrappedResponsesDistinguishBusinessFailuresAtHttp200() {
    double loginBefore = count("/auth/login", "success");
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);
    assertIncrement("/auth/login", "success", loginBefore, 1);
    assertBusinessResponse(
        "/auth/login",
        HttpMethod.POST,
        Map.of("username", "", "password", ""),
        null,
        40000,
        "/auth/login",
        "validation");
    assertBusinessResponse(
        "/auth/login",
        HttpMethod.POST,
        Map.of("username", "metrics-missing-account", "password", "WrongPassword2026"),
        null,
        40100,
        "/auth/login",
        "authentication");
    assertBusinessResponse(
        "/system/users/me", HttpMethod.GET, null, token, 0, "/system/users/me", "success");
    assertBusinessResponse(
        "/system/users/page?page=0",
        HttpMethod.GET,
        null,
        token,
        40000,
        "/system/users/page",
        "validation");
    for (var entry :
        Map.of(
                40300,
                "authorization",
                40400,
                "not_found",
                40900,
                "conflict",
                42900,
                "rate_limited",
                50000,
                "system_error")
            .entrySet()) {
      assertBusinessResponse(
          "/metrics-probe/failure/" + entry.getKey(),
          HttpMethod.GET,
          null,
          token,
          entry.getKey(),
          "/metrics-probe/failure/{code}",
          entry.getValue());
    }
    assertBusinessResponse(
        "/metrics-probe/system-error",
        HttpMethod.GET,
        null,
        token,
        50000,
        "/metrics-probe/system-error",
        "system_error");
    assertBusinessResponse(
        "/metrics-probe/explicit/11019",
        HttpMethod.GET,
        null,
        token,
        11019,
        "/metrics-probe/explicit/{code}",
        "other");
  }

  @Test
  void authenticationAuthorizationNative401AndRevokedJwtAreCountedBeforeRouting() {
    assertBusinessResponse(
        "/system/users/me", HttpMethod.GET, null, null, 40100, "UNKNOWN", "authentication");
    double before = count("UNKNOWN", "authentication");
    var nativeFailure = get("/system/users/me", "invalid-metrics-probe", String.class);
    assertThat(nativeFailure.getStatusCode().value()).isEqualTo(401);
    assertThat(nativeFailure.getBody()).isNullOrEmpty();
    assertThat(nativeFailure.getHeaders().getFirst("WWW-Authenticate")).startsWith("Bearer");
    assertIncrement("UNKNOWN", "authentication", before, 1);

    String token = loginAndGetToken("admin", ADMIN_PASSWORD);
    assertBusinessResponse(
        "/actuator/prometheus", HttpMethod.GET, null, token, 40300, "UNKNOWN", "authorization");
    onlineUserRegistry.blacklist(jwtDecoder.decode(token).getId(), Duration.ofMinutes(1));
    assertBusinessResponse(
        "/system/users/me", HttpMethod.GET, null, token, 40100, "UNKNOWN", "authentication");
  }

  @Test
  void binaryAndNullResponsesKeepTheirWireContractAndAreNotBusinessSuccess() {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);
    String route = "/calendar/data-imports/template";
    double before = count(route, "unclassified");
    var response = get(route + "?targetType=SYSTEM_BASELINE&year=2026", token, byte[].class);
    assertThat(response.getStatusCode().value()).isEqualTo(200);
    assertThat(response.getHeaders().getContentType().toString()).startsWith("text/csv");
    assertThat(response.getHeaders().getFirst("Content-Disposition")).contains("attachment");
    assertThat(response.getBody()).isNotEmpty();
    assertIncrement(route, "unclassified", before, 1);
    before = count("/metrics-probe/null-envelope", "unclassified");
    assertThat(get("/metrics-probe/null-envelope", token, String.class).getBody()).isNullOrEmpty();
    assertIncrement("/metrics-probe/null-envelope", "unclassified", before, 1);

    before = count("/metrics-probe/entity", "conflict");
    var envelopeEntity = get("/metrics-probe/entity", token, String.class);
    assertThat(envelopeEntity.getStatusCode().value()).isEqualTo(200);
    assertThat(envelopeEntity.getHeaders().getFirst("X-Probe")).isEqualTo("preserved");
    assertThat(objectMapper.readTree(envelopeEntity.getBody()).path("code").asInt())
        .isEqualTo(40900);
    assertIncrement("/metrics-probe/entity", "conflict", before, 1);
  }

  @Test
  void concurrentAndAsyncRequestsCountOnceAndUseTemplatesInsteadOfIdentifiers() throws Exception {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);
    String route = "/metrics-probe/plain/{id}";
    String asyncRoute = "/metrics-probe/async/{id}";
    double before = count(route, "success");
    double asyncBefore = count(asyncRoute, "success");
    List<Callable<Void>> requests = new ArrayList<>();
    List<String> identifiers = new ArrayList<>();
    for (int index = 0; index < 24; index++) {
      String identifier = UUID.randomUUID().toString();
      identifiers.add(identifier);
      requests.add(
          () -> {
            assertThat(getForData("/metrics-probe/plain/" + identifier, token).path("id").asText())
                .isEqualTo(identifier);
            assertThat(getForData("/metrics-probe/async/" + identifier, token).path("id").asText())
                .isEqualTo(identifier);
            return null;
          });
    }
    try (var executor = Executors.newFixedThreadPool(6)) {
      for (var future : executor.invokeAll(requests)) {
        future.get();
      }
    }
    assertIncrement(route, "success", before, 24);
    assertIncrement(asyncRoute, "success", asyncBefore, 24);
    var meters = meterRegistry.find(HttpBusinessMetrics.METER_NAME).meters();
    assertThat(meters)
        .allSatisfy(
            meter -> {
              assertThat(meter.getId().getTags())
                  .extracting(tag -> tag.getKey())
                  .containsExactlyInAnyOrder("route", "result");
              assertThat(meter.getId().getTag("route"))
                  .doesNotContain(identifiers.toArray(String[]::new));
            });
    assertThat(meters.stream().filter(m -> route.equals(m.getId().getTag("route")))).hasSize(1);
    assertThat(meters.stream().filter(m -> asyncRoute.equals(m.getId().getTag("route"))))
        .hasSize(1);
  }

  @Test
  void randomUnknownPathsCollapseToOneSeries() {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);
    double before = count("UNKNOWN", "not_found");
    for (int index = 0; index < 20; index++) {
      var body =
          exchangeRaw(
              "/unknown-metrics-" + UUID.randomUUID() + "?privateId=" + UUID.randomUUID(),
              HttpMethod.GET,
              null,
              token);
      assertThat(body.path("code").asInt()).isEqualTo(40400);
    }
    assertIncrement("UNKNOWN", "not_found", before, 20);
    assertThat(meterRegistry.find(HttpBusinessMetrics.METER_NAME).meters())
        .allSatisfy(
            meter ->
                assertThat(meter.getId().getTag("route"))
                    .doesNotContain("unknown-metrics-", "privateId="));
  }

  @Test
  void existingProtectedPrometheusEndpointExportsTheBusinessCounter() {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);
    String identifier = UUID.randomUUID().toString();
    double before = count("/metrics-probe/plain/{id}", "success");
    getForData("/metrics-probe/plain/" + identifier, token);
    assertIncrement("/metrics-probe/plain/{id}", "success", before, 1);
    var issued =
        exchangeRaw(
            "/auth/token",
            HttpMethod.POST,
            Map.of("clientId", "management-test-client", "clientSecret", "management-test-secret"),
            null);
    assertThat(issued.path("code").asInt()).isZero();
    var response =
        get("/actuator/prometheus", issued.at("/data/accessToken").asText(), String.class);
    assertThat(response.getStatusCode().value()).isEqualTo(200);
    assertThat(response.getHeaders().getContentType().toString()).startsWith("text/plain");
    assertThat(response.getBody())
        .contains("# TYPE apocalypse_http_business_requests_total counter");
    var samples =
        response
            .getBody()
            .lines()
            .filter(line -> line.startsWith("apocalypse_http_business_requests_total{"))
            .toList();
    assertThat(samples)
        .anySatisfy(
            line ->
                assertThat(line)
                    .contains("result=\"success\"", "route=\"/metrics-probe/plain/{id}\""));
    assertThat(samples)
        .allSatisfy(
            line -> assertThat(line).doesNotContain(identifier, "management-test-secret", token));
  }

  private void assertBusinessResponse(
      String path,
      HttpMethod method,
      Object body,
      String token,
      int code,
      String route,
      String result) {
    double before = count(route, result);
    double totalBefore = total();
    assertThat(exchangeRaw(path, method, body, token).path("code").asInt()).isEqualTo(code);
    assertIncrement(route, result, before, 1);
    assertThat(total()).isEqualTo(totalBefore + 1);
  }

  private <T> ResponseEntity<T> get(String path, String token, Class<T> type) {
    HttpHeaders headers = new HttpHeaders();
    if (token != null) {
      headers.setBearerAuth(token);
    }
    return restTemplate.exchange(path, HttpMethod.GET, new HttpEntity<>(headers), type);
  }

  private double count(String route, String result) {
    Counter counter =
        meterRegistry
            .find(HttpBusinessMetrics.METER_NAME)
            .tags("route", route, "result", result)
            .counter();
    return counter == null ? 0 : counter.count();
  }

  private double total() {
    return meterRegistry.find(HttpBusinessMetrics.METER_NAME).counters().stream()
        .mapToDouble(Counter::count)
        .sum();
  }

  private void assertIncrement(String route, String result, double before, int delta) {
    await()
        .atMost(Duration.ofSeconds(5))
        .untilAsserted(() -> assertThat(count(route, result)).isEqualTo(before + delta));
  }

  @TestConfiguration(proxyBeanMethods = false)
  static class ProbeConfiguration {

    @Bean
    ProbeController metricsProbeController() {
      return new ProbeController();
    }
  }

  @RestController
  @RequestMapping("/metrics-probe")
  static class ProbeController {

    @GetMapping("/plain/{id}")
    Map<String, String> plain(@PathVariable String id) {
      return Map.of("id", id);
    }

    @GetMapping("/async/{id}")
    Callable<Map<String, String>> async(@PathVariable String id) {
      return () -> Map.of("id", id);
    }

    @GetMapping("/explicit/{code}")
    R<Void> explicit(@PathVariable int code) {
      return R.fail(code, "测试业务结果");
    }

    @GetMapping("/failure/{code}")
    void failure(@PathVariable int code) {
      throw new BizException(code, "测试异常结果");
    }

    @GetMapping("/system-error")
    void systemError() {
      throw new IllegalStateException("测试内部错误");
    }

    @GetMapping("/null-envelope")
    R<Void> nullEnvelope() {
      return null;
    }

    @GetMapping("/entity")
    ResponseEntity<R<Void>> entity() {
      return ResponseEntity.ok().header("X-Probe", "preserved").body(R.fail(40900, "冲突"));
    }
  }
}
