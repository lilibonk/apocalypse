package io.apocalypse;

import io.apocalypse.framework.security.OnlineUserRegistry;
import io.apocalypse.framework.security.SecurityProperties;
import io.apocalypse.framework.security.TokenVersionStore;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;

import tools.jackson.databind.JsonNode;

/** 真实 HTTP 的浏览器 Cookie 协议、CSRF/来源、原子旋转和 PostgreSQL 最终撤销边界。 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "apocalypse.security.browser.secure-cookie=true",
      "apocalypse.security.browser.allowed-origins=https://browser.example.test",
      "apocalypse.security.cors.allowed-origins=https://browser.example.test"
    })
class BrowserSessionIT extends AbstractIntegrationTest {
  private static final String ORIGIN = "https://browser.example.test";
  private static final String REFRESH_COOKIE = "__Host-apocalypse-refresh";
  private static final String PASSWORD = "BrowserFixture2026";
  private static final AtomicLong IDS = new AtomicLong(9_094_000_000_000_000L);
  private static final HttpClient HTTP = HttpClient.newHttpClient();

  @Autowired private PasswordEncoder passwordEncoder;
  @Autowired private TokenVersionStore versions;
  @MockitoSpyBean private OnlineUserRegistry registry;
  @Autowired private StringRedisTemplate redis;
  @Autowired private JwtEncoder jwtEncoder;
  @Autowired private JwtDecoder jwtDecoder;
  @Autowired private SecurityProperties properties;
  private String username;
  private long userId;

  @BeforeEach
  void createFixture() {
    username =
        "it_browser_session_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    userId = IDS.incrementAndGet();
    jdbcTemplate.update(
        "INSERT INTO sys_user (id, username, password, status) VALUES (?, ?, ?, 1)",
        userId,
        username,
        passwordEncoder.encode(PASSWORD));
  }

  @AfterEach
  void cleanup() {
    registry.kickAll(username);
    jdbcTemplate.update("DELETE FROM sys_user WHERE id = ?", userId);
    jdbcTemplate.update(
        "DELETE FROM security_token_version WHERE version_key LIKE ?", "%:" + username);
  }

  @Test
  void csrfCookiePlainHeaderLogsInAndOnlyMemoryAccessAppearsInResponse() {
    Csrf csrf = bootstrap();
    Reply reply = login(csrf);
    assertSuccess(reply);
    assertThat(reply.body().at("/data/accessToken").isTextual()).isTrue();
    assertThat(reply.body().at("/data/refreshToken").isMissingNode()).isTrue();
    assertThat(reply.body().at("/data/tokenType").asText()).isEqualTo("Bearer");
    assertThat(reply.body().at("/data/expiresIn").asLong()).isPositive();
    assertThat(cookieAttributes(reply, REFRESH_COOKIE))
        .contains("Path=/", "Max-Age=604800", "Secure", "HttpOnly", "SameSite=Strict")
        .doesNotContain("Domain=");
    assertThat(cookieAttributes(reply, "XSRF-TOKEN"))
        .contains("Path=/", "Secure", "SameSite=Strict")
        .doesNotContain("HttpOnly", "Domain=");
    assertThat(reply.header("Cache-Control")).contains("no-store");
    String access = reply.body().at("/data/accessToken").asText();
    assertThat(
            send("GET", "/system/users/me", null, headers("Authorization", "Bearer " + access))
                .code())
        .isZero();
    assertThat(
            send(
                    "GET",
                    "/system/users/me",
                    null,
                    headers("Cookie", cookies(csrf.value(), cookieValue(reply, REFRESH_COOKIE))))
                .code())
        .isEqualTo(40100);
  }

  @Test
  void missingMismatchedOrDuplicateCsrfCookieAndHeaderCannotLogin() {
    Csrf csrf = bootstrap();
    List<List<Map.Entry<String, String>>> variants =
        List.of(
            headers("Origin", ORIGIN),
            headers("Origin", ORIGIN, "Cookie", "XSRF-TOKEN=" + csrf.value()),
            headers("Origin", ORIGIN, "X-XSRF-TOKEN", csrf.value()),
            headers(
                "Origin",
                ORIGIN,
                "Cookie",
                "XSRF-TOKEN=" + csrf.value(),
                "X-XSRF-TOKEN",
                "mismatch-fixture"),
            headers(
                "Origin",
                ORIGIN,
                "Cookie",
                "XSRF-TOKEN=" + csrf.value() + "; XSRF-TOKEN=" + csrf.value(),
                "X-XSRF-TOKEN",
                csrf.value()),
            headers(
                "Origin",
                ORIGIN,
                "Cookie",
                "XSRF-TOKEN=" + csrf.value(),
                "X-XSRF-TOKEN",
                csrf.value(),
                "X-XSRF-TOKEN",
                csrf.value()));
    for (var requestHeaders : variants) {
      Reply reply = send("POST", "/auth/browser/login", loginBody(), requestHeaders);
      assertDenied(reply);
      assertThat(hasRefreshCookie(reply)).isFalse();
    }
    assertSuccess(login(csrf));
  }

  @Test
  void exactOriginAndFetchMetadataAreRequiredForAllBrowserPostEndpoints() {
    Csrf csrf = bootstrap();
    Reply login = login(csrf);
    assertSuccess(login);
    String refresh = cookieValue(login, REFRESH_COOKIE);
    String csrfValue = cookieValue(login, "XSRF-TOKEN");
    List<List<Map.Entry<String, String>>> originVariants =
        List.of(
            List.of(),
            headers("Origin", "null"),
            headers("Origin", "https://unapproved.example.test"),
            headers("Origin", ORIGIN, "Origin", ORIGIN),
            headers("Origin", ORIGIN, "Sec-Fetch-Site", "cross-site"));
    long before = versions.current(username).credential();
    for (String endpoint : List.of("login", "refresh", "logout")) {
      for (var origins : originVariants) {
        List<Map.Entry<String, String>> requestHeaders =
            new ArrayList<>(
                headers("Cookie", cookies(csrfValue, refresh), "X-XSRF-TOKEN", csrfValue));
        requestHeaders.addAll(origins);
        Reply reply =
            send(
                "POST",
                "/auth/browser/" + endpoint,
                endpoint.equals("login") ? loginBody() : null,
                requestHeaders);
        assertDenied(reply);
        assertThat(hasRefreshCookie(reply)).isFalse();
      }
    }
    assertThat(versions.current(username).credential()).isEqualTo(before);
    assertSuccess(send("POST", "/auth/browser/refresh", null, browserHeaders(csrfValue, refresh)));
  }

  @Test
  void maskedQueryParameterCannotReplaceCsrfHeaderOnBrowserPostEndpoints() {
    Csrf csrf = bootstrap();
    Reply loggedIn = login(csrf);
    assertSuccess(loggedIn);
    String refresh = cookieValue(loggedIn, REFRESH_COOKIE);
    String csrfValue = cookieValue(loggedIn, "XSRF-TOKEN");
    Reply masked =
        send("GET", "/auth/browser/csrf", null, headers("Cookie", "XSRF-TOKEN=" + csrfValue));
    assertSuccess(masked);
    String parameter =
        URLEncoder.encode(masked.body().at("/data/token").asText(), StandardCharsets.UTF_8);
    long before = versions.current(username).credential();
    for (String endpoint : List.of("login", "refresh", "logout")) {
      Reply reply =
          send(
              "POST",
              "/auth/browser/" + endpoint + "?_csrf=" + parameter,
              endpoint.equals("login") ? loginBody() : null,
              headers("Origin", ORIGIN, "Cookie", cookies(csrfValue, refresh)));
      assertDenied(reply);
      assertThat(hasRefreshCookie(reply)).isFalse();
    }
    assertThat(versions.current(username).credential()).isEqualTo(before);
    assertSuccess(send("POST", "/auth/browser/refresh", null, browserHeaders(csrfValue, refresh)));
  }

  @Test
  void absentBlankDuplicateTamperedWrongTypeAndExpiredRefreshAreRejectedWithoutCookieDeletion() {
    Csrf csrf = bootstrap();
    Reply loggedIn = login(csrf);
    assertSuccess(loggedIn);
    String refresh = cookieValue(loggedIn, REFRESH_COOKIE);
    String csrfValue = cookieValue(loggedIn, "XSRF-TOKEN");
    String access = loggedIn.body().at("/data/accessToken").asText();
    int signatureOffset = refresh.lastIndexOf('.') + 1;
    String tampered =
        refresh.substring(0, signatureOffset)
            + (refresh.charAt(signatureOffset) == 'A' ? 'B' : 'A')
            + refresh.substring(signatureOffset + 1);
    long before = versions.current(username).credential();
    for (String endpoint : List.of("refresh", "logout")) {
      for (String invalid : List.of("", tampered, access, expiredRefresh())) {
        Reply reply =
            send("POST", "/auth/browser/" + endpoint, null, browserHeaders(csrfValue, invalid));
        assertThat(reply.code()).isEqualTo(40100);
        assertThat(hasRefreshCookie(reply)).isFalse();
      }
      Reply missing =
          send(
              "POST",
              "/auth/browser/" + endpoint,
              null,
              headers(
                  "Origin",
                  ORIGIN,
                  "Cookie",
                  "XSRF-TOKEN=" + csrfValue,
                  "X-XSRF-TOKEN",
                  csrfValue));
      assertThat(missing.code()).isEqualTo(40100);
      assertThat(hasRefreshCookie(missing)).isFalse();
      Reply duplicate =
          send(
              "POST",
              "/auth/browser/" + endpoint,
              null,
              headers(
                  "Origin",
                  ORIGIN,
                  "Cookie",
                  cookies(csrfValue, refresh) + "; " + REFRESH_COOKIE + "=" + refresh,
                  "X-XSRF-TOKEN",
                  csrfValue));
      assertThat(duplicate.code()).isEqualTo(40100);
      assertThat(hasRefreshCookie(duplicate)).isFalse();
    }
    assertThat(versions.current(username).credential()).isEqualTo(before);
    assertSuccess(send("POST", "/auth/browser/refresh", null, browserHeaders(csrfValue, refresh)));
  }

  @Test
  void failedBrowserLoginNeverIssuesOrClearsAnExistingRefreshCookie() {
    Csrf csrf = bootstrap();
    Reply existing = login(csrf);
    assertSuccess(existing);
    String refresh = cookieValue(existing, REFRESH_COOKIE);
    String csrfValue = cookieValue(existing, "XSRF-TOKEN");
    Reply failed =
        send(
            "POST",
            "/auth/browser/login",
            Map.of("username", username, "password", "IncorrectBrowser2026"),
            browserHeaders(csrfValue, refresh));
    assertThat(failed.code()).isEqualTo(40100);
    assertThat(hasRefreshCookie(failed)).isFalse();
    assertSuccess(send("POST", "/auth/browser/refresh", null, browserHeaders(csrfValue, refresh)));
  }

  @Test
  void rotationRejectsReplayAndReplayLogoutDoesNotClearCurrentCookieOrRevokeWinner() {
    Csrf csrf = bootstrap();
    Reply login = login(csrf);
    assertSuccess(login);
    String firstRefresh = cookieValue(login, REFRESH_COOKIE);
    String firstCsrf = cookieValue(login, "XSRF-TOKEN");
    Reply rotated =
        send("POST", "/auth/browser/refresh", null, browserHeaders(firstCsrf, firstRefresh));
    assertSuccess(rotated);
    assertThat(rotated.body().at("/data/refreshToken").isMissingNode()).isTrue();
    assertThat(cookieValue(rotated, REFRESH_COOKIE).equals(firstRefresh)).isFalse();
    Reply replay =
        send("POST", "/auth/browser/refresh", null, browserHeaders(firstCsrf, firstRefresh));
    assertThat(replay.code()).isEqualTo(40100);
    assertThat(hasRefreshCookie(replay)).isFalse();
    long before = versions.current(username).credential();
    Reply replayLogout =
        send("POST", "/auth/browser/logout", null, browserHeaders(firstCsrf, firstRefresh));
    assertThat(replayLogout.code()).isEqualTo(40100);
    assertThat(hasRefreshCookie(replayLogout)).isFalse();
    assertThat(versions.current(username).credential()).isEqualTo(before);
    assertSuccess(
        send(
            "POST",
            "/auth/browser/refresh",
            null,
            browserHeaders(
                cookieValue(rotated, "XSRF-TOKEN"), cookieValue(rotated, REFRESH_COOKIE))));
  }

  @Test
  void twoConcurrentRequestsConsumeOneRefreshAndLoserCannotOverwriteWinnerCookie()
      throws Exception {
    Csrf csrf = bootstrap();
    Reply login = login(csrf);
    assertSuccess(login);
    String refresh = cookieValue(login, REFRESH_COOKIE);
    String csrfValue = cookieValue(login, "XSRF-TOKEN");
    CountDownLatch ready = new CountDownLatch(2);
    CountDownLatch start = new CountDownLatch(1);
    try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
      List<java.util.concurrent.Future<Reply>> calls = new ArrayList<>();
      for (int i = 0; i < 2; i++) {
        calls.add(
            executor.submit(
                () -> {
                  ready.countDown();
                  if (!start.await(10, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("refresh start timed out");
                  }
                  return send(
                      "POST", "/auth/browser/refresh", null, browserHeaders(csrfValue, refresh));
                }));
      }
      assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
      start.countDown();
      List<Reply> results =
          List.of(calls.get(0).get(10, TimeUnit.SECONDS), calls.get(1).get(10, TimeUnit.SECONDS));
      assertThat(results.stream().map(Reply::code).toList()).containsExactlyInAnyOrder(0, 40100);
      Reply winner = results.stream().filter(reply -> reply.code() == 0).findFirst().orElseThrow();
      Reply loser =
          results.stream().filter(reply -> reply.code() == 40100).findFirst().orElseThrow();
      assertThat(hasRefreshCookie(loser)).isFalse();
      assertThat(hasRefreshCookie(winner)).isTrue();
      assertSuccess(
          send(
              "POST",
              "/auth/browser/refresh",
              null,
              browserHeaders(
                  cookieValue(winner, "XSRF-TOKEN"), cookieValue(winner, REFRESH_COOKIE))));
    }
  }

  @ParameterizedTest
  @ValueSource(strings = {"refresh", "logout"})
  void refreshAndLogoutCompeteForOneAtomicConsumptionWithoutLoserCookieMutation(
      String firstConsumer) throws Exception {
    Reply browser = login(bootstrap());
    assertSuccess(browser);
    Reply machine = send("POST", "/auth/login", loginBody(), List.of());
    assertSuccess(machine);
    String refresh = cookieValue(browser, REFRESH_COOKIE);
    String csrfValue = cookieValue(browser, "XSRF-TOKEN");
    String refreshId = jwtDecoder.decode(refresh).getId();
    long before = versions.current(username).credential();
    CountDownLatch arrivedAtConsume = new CountDownLatch(2);
    CountDownLatch releaseConsumption = new CountDownLatch(1);
    CountDownLatch firstConsumed = new CountDownLatch(1);
    // Both HTTP requests finish credential checks before the real Redis SET NX.
    // Control only their ordering, so both possible winners have deterministic coverage.
    doAnswer(
            invocation -> {
              arrivedAtConsume.countDown();
              if (!releaseConsumption.await(10, TimeUnit.SECONDS)) {
                throw new IllegalStateException("consumption release timed out");
              }
              var request =
                  ((ServletRequestAttributes) RequestContextHolder.currentRequestAttributes())
                      .getRequest();
              if (request.getRequestURI().endsWith("/" + firstConsumer)) {
                try {
                  return invocation.callRealMethod();
                } finally {
                  firstConsumed.countDown();
                }
              }
              if (!firstConsumed.await(10, TimeUnit.SECONDS)) {
                throw new IllegalStateException("first consumption timed out");
              }
              return invocation.callRealMethod();
            })
        .when(registry)
        .tryBlacklist(eq(refreshId), any(java.time.Duration.class));

    try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
      var refreshing =
          executor.submit(
              () ->
                  send("POST", "/auth/browser/refresh", null, browserHeaders(csrfValue, refresh)));
      var loggingOut =
          executor.submit(
              () -> send("POST", "/auth/browser/logout", null, browserHeaders(csrfValue, refresh)));
      try {
        assertThat(arrivedAtConsume.await(10, TimeUnit.SECONDS)).isTrue();
      } finally {
        releaseConsumption.countDown();
      }
      Reply refreshReply = refreshing.get(10, TimeUnit.SECONDS);
      Reply logoutReply = loggingOut.get(10, TimeUnit.SECONDS);
      assertThat(List.of(refreshReply.code(), logoutReply.code()))
          .containsExactlyInAnyOrder(0, 40100);
      Reply winner = firstConsumer.equals("refresh") ? refreshReply : logoutReply;
      Reply loser = firstConsumer.equals("refresh") ? logoutReply : refreshReply;
      assertSuccess(winner);
      assertThat(loser.code()).isEqualTo(40100);
      assertThat(loser.setCookies().isEmpty()).isTrue();
      if (firstConsumer.equals("refresh")) {
        assertThat(versions.current(username).credential()).isEqualTo(before);
        assertSuccess(
            send(
                "POST",
                "/auth/browser/refresh",
                null,
                browserHeaders(
                    cookieValue(winner, "XSRF-TOKEN"), cookieValue(winner, REFRESH_COOKIE))));
        assertThat(
                send(
                        "GET",
                        "/system/users/me",
                        null,
                        headers(
                            "Authorization",
                            "Bearer " + machine.body().at("/data/accessToken").asText()))
                    .code())
            .isZero();
      } else {
        assertThat(versions.current(username).credential()).isEqualTo(before + 1);
        assertThat(cookieValue(winner, REFRESH_COOKIE).isEmpty()).isTrue();
        for (Reply session : List.of(browser, machine)) {
          assertThat(
                  send(
                          "GET",
                          "/system/users/me",
                          null,
                          headers(
                              "Authorization",
                              "Bearer " + session.body().at("/data/accessToken").asText()))
                      .code())
              .isEqualTo(40100);
        }
        assertThat(
                send(
                        "POST",
                        "/auth/refresh",
                        Map.of("refreshToken", machine.body().at("/data/refreshToken").asText()),
                        List.of())
                    .code())
            .isEqualTo(40100);
        assertThat(
                send("POST", "/auth/browser/refresh", null, browserHeaders(csrfValue, refresh))
                    .code())
            .isEqualTo(40100);
      }
    }
  }

  @Test
  void successfulLogoutDeletesCookiesAndDurablyRevokesAllSessionsWhenRedisOnlineViewIsGone() {
    Csrf csrf = bootstrap();
    Reply browser = login(csrf);
    assertSuccess(browser);
    Reply machine = send("POST", "/auth/login", loginBody(), List.of());
    assertSuccess(machine);
    String browserAccess = browser.body().at("/data/accessToken").asText();
    String machineAccess = machine.body().at("/data/accessToken").asText();
    String machineRefresh = machine.body().at("/data/refreshToken").asText();
    List<String> accessIds =
        List.of(jwtDecoder.decode(browserAccess).getId(), jwtDecoder.decode(machineAccess).getId());
    accessIds.forEach(jti -> redis.delete(OnlineUserRegistry.ONLINE_KEY_PREFIX + jti));
    assertThat(accessIds.stream().anyMatch(jti -> registry.find(jti).isPresent())).isFalse();
    long before = versions.current(username).credential();
    Reply logout =
        send(
            "POST",
            "/auth/browser/logout",
            null,
            browserHeaders(
                cookieValue(browser, "XSRF-TOKEN"), cookieValue(browser, REFRESH_COOKIE)));
    assertSuccess(logout);
    assertThat(versions.current(username).credential()).isEqualTo(before + 1);
    assertThat(cookieAttributes(logout, REFRESH_COOKIE))
        .contains("Max-Age=0", "Path=/", "Secure", "HttpOnly", "SameSite=Strict")
        .doesNotContain("Domain=");
    assertThat(cookieValue(logout, REFRESH_COOKIE).isEmpty()).isTrue();
    assertThat(cookieAttributes(logout, "XSRF-TOKEN"))
        .contains("Path=/", "Secure", "SameSite=Strict");
    assertThat(cookieValue(logout, "XSRF-TOKEN").isEmpty()).isTrue();
    assertThat(cookieExpired(logout, "XSRF-TOKEN")).isTrue();
    assertThat(accessIds.stream().anyMatch(registry::isBlacklisted)).isFalse();
    for (String access : List.of(browserAccess, machineAccess)) {
      assertThat(
              send("GET", "/system/users/me", null, headers("Authorization", "Bearer " + access))
                  .code())
          .isEqualTo(40100);
    }
    assertThat(
            send("POST", "/auth/refresh", Map.of("refreshToken", machineRefresh), List.of()).code())
        .isEqualTo(40100);
    Reply oldBrowser =
        send(
            "POST",
            "/auth/browser/refresh",
            null,
            browserHeaders(
                cookieValue(browser, "XSRF-TOKEN"), cookieValue(browser, REFRESH_COOKIE)));
    assertThat(oldBrowser.code()).isEqualTo(40100);
    assertThat(hasRefreshCookie(oldBrowser)).isFalse();
  }

  @Test
  void legacyJsonPairAndBearerEndpointsRequireNoBrowserCsrfAndDoNotSetCookies() {
    Reply pair = send("POST", "/auth/login", loginBody(), List.of());
    assertSuccess(pair);
    assertThat(pair.body().at("/data/refreshToken").isTextual()).isTrue();
    assertThat(pair.setCookies().isEmpty()).isTrue();
    Reply refresh =
        send(
            "POST",
            "/auth/refresh",
            Map.of("refreshToken", pair.body().at("/data/refreshToken").asText()),
            List.of());
    assertSuccess(refresh);
    assertThat(refresh.body().at("/data/refreshToken").isTextual()).isTrue();
    assertThat(refresh.setCookies().isEmpty()).isTrue();
    Reply me =
        send(
            "GET",
            "/system/users/me",
            null,
            headers("Authorization", "Bearer " + refresh.body().at("/data/accessToken").asText()));
    assertSuccess(me);
    assertThat(me.setCookies().isEmpty()).isTrue();
    Reply logout =
        send(
            "POST",
            "/auth/logout",
            null,
            headers("Authorization", "Bearer " + refresh.body().at("/data/accessToken").asText()));
    assertSuccess(logout);
    assertThat(logout.setCookies().isEmpty()).isTrue();
  }

  private Csrf bootstrap() {
    Reply csrf = send("GET", "/auth/browser/csrf", null, List.of());
    assertSuccess(csrf);
    assertThat(csrf.body().at("/data/token").isTextual()).isTrue();
    assertThat(csrf.header("Cache-Control")).contains("no-store");
    return new Csrf(cookieValue(csrf, "XSRF-TOKEN"));
  }

  private Reply login(Csrf csrf) {
    return send(
        "POST",
        "/auth/browser/login",
        loginBody(),
        headers(
            "Origin",
            ORIGIN,
            "Cookie",
            "XSRF-TOKEN=" + csrf.value(),
            "X-XSRF-TOKEN",
            csrf.value()));
  }

  private Map<String, String> loginBody() {
    return Map.of("username", username, "password", PASSWORD);
  }

  private String expiredRefresh() {
    Instant now = Instant.now();
    JwtClaimsSet claims =
        JwtClaimsSet.builder()
            .issuer(properties.getJwt().getIssuer())
            .audience(List.of(properties.getJwt().getAudience()))
            .subject(username)
            .id(UUID.randomUUID().toString())
            .issuedAt(now.minusSeconds(300))
            .expiresAt(now.minusSeconds(120))
            .claim("uid", userId)
            .claim("type", "refresh")
            .claim("atj", UUID.randomUUID().toString())
            .claim("cv", versions.current(username).credential())
            .build();
    return jwtEncoder
        .encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims))
        .getTokenValue();
  }

  private Reply send(
      String method, String path, Object body, List<Map.Entry<String, String>> headers) {
    try {
      HttpRequest.Builder builder =
          HttpRequest.newBuilder(URI.create(restTemplate.getRootUri() + path));
      headers.forEach(header -> builder.header(header.getKey(), header.getValue()));
      builder.header("Content-Type", "application/json");
      builder.method(
          method,
          body == null
              ? HttpRequest.BodyPublishers.noBody()
              : HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)));
      HttpResponse<String> response =
          HTTP.send(builder.build(), HttpResponse.BodyHandlers.ofString());
      boolean json =
          response.headers().firstValue("Content-Type").orElse("").contains("application/json");
      return new Reply(
          response.statusCode(),
          json ? objectMapper.readTree(response.body()) : null,
          response.headers());
    } catch (java.io.IOException exception) {
      throw new IllegalStateException("HTTP fixture failed", exception);
    } catch (InterruptedException exception) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException("HTTP fixture interrupted", exception);
    }
  }

  private static List<Map.Entry<String, String>> browserHeaders(String csrf, String refresh) {
    return headers("Origin", ORIGIN, "Cookie", cookies(csrf, refresh), "X-XSRF-TOKEN", csrf);
  }

  private static String cookies(String csrf, String refresh) {
    return "XSRF-TOKEN=" + csrf + "; " + REFRESH_COOKIE + "=" + refresh;
  }

  private static List<Map.Entry<String, String>> headers(String... pairs) {
    List<Map.Entry<String, String>> result = new ArrayList<>();
    for (int i = 0; i < pairs.length; i += 2) {
      result.add(Map.entry(pairs[i], pairs[i + 1]));
    }
    return result;
  }

  private static void assertSuccess(Reply reply) {
    assertThat(reply.status()).isEqualTo(200);
    assertThat(reply.code()).isZero();
  }

  private static void assertDenied(Reply reply) {
    assertThat(reply.status() == 403 || (reply.status() == 200 && reply.code() == 40300)).isTrue();
  }

  private static boolean hasRefreshCookie(Reply reply) {
    return reply.setCookies().stream().anyMatch(value -> value.startsWith(REFRESH_COOKIE + "="));
  }

  private static String cookieValue(Reply reply, String name) {
    List<String> values =
        reply.setCookies().stream().filter(value -> value.startsWith(name + "=")).toList();
    assertThat(values.size()).as("Cookie count for %s", name).isEqualTo(1);
    String value = values.getFirst();
    return value.substring(name.length() + 1, value.indexOf(';'));
  }

  private static String cookieAttributes(Reply reply, String name) {
    List<String> values =
        reply.setCookies().stream().filter(value -> value.startsWith(name + "=")).toList();
    assertThat(values.size()).as("Cookie count for %s", name).isEqualTo(1);
    return values.getFirst().substring(values.getFirst().indexOf(';'));
  }

  private static boolean cookieExpired(Reply reply, String name) {
    String attributes = cookieAttributes(reply, name);
    for (String attribute : attributes.split(";")) {
      if (attribute.trim().startsWith("Max-Age=")) {
        return attribute.trim().equals("Max-Age=0");
      }
    }
    for (String attribute : attributes.split(";")) {
      if (attribute.trim().startsWith("Expires=")) {
        String expiry = attribute.trim().substring("Expires=".length());
        return ZonedDateTime.parse(expiry, DateTimeFormatter.RFC_1123_DATE_TIME)
            .toInstant()
            .isBefore(Instant.now());
      }
    }
    return false;
  }

  private record Csrf(String value) {}

  private record Reply(int status, JsonNode body, java.net.http.HttpHeaders headers) {
    int code() {
      return body == null ? -1 : body.path("code").asInt(-1);
    }

    List<String> setCookies() {
      return headers.allValues("Set-Cookie");
    }

    String header(String name) {
      return headers.firstValue(name).orElse("");
    }
  }
}
