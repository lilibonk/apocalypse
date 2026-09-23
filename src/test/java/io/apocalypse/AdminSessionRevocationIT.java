package io.apocalypse;

import io.apocalypse.framework.security.OnlineUserRegistry;
import io.apocalypse.framework.security.TokenVersionStore;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpMethod;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doThrow;

import tools.jackson.databind.JsonNode;

/** 管理员全设备撤销覆盖刷新链、独立登录和刷新交错；在线索引只用于选择用户。 */
class AdminSessionRevocationIT extends AbstractIntegrationTest {

  @Autowired private JwtDecoder jwtDecoder;

  @Autowired private TokenVersionStore tokenVersionStore;

  @Autowired private StringRedisTemplate redis;

  @MockitoSpyBean private OnlineUserRegistry onlineUserRegistry;

  @Test
  void kickRevokesRotatedAndIndependentLoginsWithoutRevokingAnotherUser() {
    String admin = loginAndGetToken("admin", ADMIN_PASSWORD);
    String username = createUser(admin);
    JsonNode first = login(username);
    JsonNode independent = login(username);
    JsonNode rotated = refresh(first.at("/data/refreshToken").asText());
    assertThat(rotated.get("code").asInt()).isZero();
    long before = tokenVersionStore.current(username).credential();

    deleteForData("/system/online-users/" + jti(rotated), admin);

    assertThat(tokenVersionStore.current(username).credential()).isEqualTo(before + 1);
    for (JsonNode pair : List.of(first, independent, rotated)) {
      // Loss of Redis blacklist state must not revive a database-revoked token.
      redis.delete(OnlineUserRegistry.BLACKLIST_KEY_PREFIX + jti(pair));
      redis.delete(
          OnlineUserRegistry.BLACKLIST_KEY_PREFIX
              + jwtDecoder.decode(pair.at("/data/refreshToken").asText()).getId());
      assertRevoked(pair);
    }
    assertThat(getForData("/system/users/me", admin).at("/user/username").asText())
        .isEqualTo("admin");
  }

  @Test
  void redisCleanupFailureDoesNotRollBackDurableRevocation() {
    String admin = loginAndGetToken("admin", ADMIN_PASSWORD);
    String username = createUser(admin);
    JsonNode pair = login(username);
    long before = tokenVersionStore.current(username).credential();
    doThrow(new IllegalStateException("simulated Redis cleanup failure"))
        .when(onlineUserRegistry)
        .kickAll(username);

    deleteForData("/system/online-users/" + jti(pair), admin);

    assertThat(tokenVersionStore.current(username).credential()).isEqualTo(before + 1);
    assertRevoked(pair);
  }

  @Test
  void missingSelectedOnlineEntryDoesNotReportSuccessfulRevocation() {
    String admin = loginAndGetToken("admin", ADMIN_PASSWORD);
    String username = createUser(admin);
    JsonNode first = login(username);
    JsonNode another = login(username);
    long before = tokenVersionStore.current(username).credential();
    redis.delete(OnlineUserRegistry.ONLINE_KEY_PREFIX + jti(first));

    JsonNode result =
        exchangeRaw("/system/online-users/" + jti(first), HttpMethod.DELETE, null, admin);
    assertThat(result.get("code").asInt()).isEqualTo(40400);
    assertThat(tokenVersionStore.current(username).credential()).isEqualTo(before);
    deleteForData("/system/online-users/" + jti(another), admin);
    assertRevoked(first);
    assertRevoked(another);
  }

  @Test
  void concurrentRefreshCannotSurviveASuccessfulAdministratorKick() throws Exception {
    String admin = loginAndGetToken("admin", ADMIN_PASSWORD);
    String username = createUser(admin);
    JsonNode first = login(username);
    // A second visible login gives the administrator a stable selection while A rotates.
    JsonNode selected = login(username);
    CountDownLatch start = new CountDownLatch(1);
    try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
      CompletableFuture<JsonNode> rotation =
          CompletableFuture.supplyAsync(
              () -> {
                await(start);
                return refresh(first.at("/data/refreshToken").asText());
              },
              executor);
      CompletableFuture<JsonNode> kick =
          CompletableFuture.supplyAsync(
              () -> {
                await(start);
                return exchangeRaw(
                    "/system/online-users/" + jti(selected), HttpMethod.DELETE, null, admin);
              },
              executor);
      start.countDown();
      assertThat(kick.get().get("code").asInt()).isZero();
      JsonNode result = rotation.get();
      assertThat(result.get("code").asInt()).isIn(0, 40100);
      if (result.get("code").asInt() == 0) assertRevoked(result);
      assertRevoked(first);
      assertRevoked(selected);
    }
  }

  private String createUser(String admin) {
    String username = "kick_" + UUID.randomUUID().toString().substring(0, 12);
    postForData(
        "/system/users",
        Map.of("username", username, "password", "TestKick2026", "nickname", "强退回归"),
        admin);
    return username;
  }

  private JsonNode login(String username) {
    JsonNode response =
        exchangeRaw(
            "/auth/login",
            HttpMethod.POST,
            Map.of("username", username, "password", "TestKick2026"),
            null);
    assertThat(response.get("code").asInt()).isZero();
    return response;
  }

  private JsonNode refresh(String token) {
    return exchangeRaw("/auth/refresh", HttpMethod.POST, Map.of("refreshToken", token), null);
  }

  private String jti(JsonNode pair) {
    return jwtDecoder.decode(pair.at("/data/accessToken").asText()).getId();
  }

  private void assertRevoked(JsonNode pair) {
    assertThat(
            exchangeRaw(
                    "/system/users/me", HttpMethod.GET, null, pair.at("/data/accessToken").asText())
                .get("code")
                .asInt())
        .isEqualTo(40100);
    assertThat(refresh(pair.at("/data/refreshToken").asText()).get("code").asInt())
        .isEqualTo(40100);
  }

  private static void await(CountDownLatch latch) {
    try {
      latch.await();
    } catch (InterruptedException exception) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException(exception);
    }
  }
}
