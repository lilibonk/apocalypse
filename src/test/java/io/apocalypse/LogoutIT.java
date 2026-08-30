package io.apocalypse;

import io.apocalypse.framework.security.OnlineUserRegistry;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpMethod;

import static org.assertj.core.api.Assertions.assertThat;

import tools.jackson.databind.JsonNode;

/** 主动注销回归：持久化撤销全部会话，旧 access/refresh 均失效，旧令牌不能重复触发注销。 */
class LogoutIT extends AbstractIntegrationTest {

  @Autowired private StringRedisTemplate redisTemplate;

  @Test
  void logoutRevokesAccessRefreshAndOtherSessions() {
    JsonNode first = login();
    JsonNode second = login();
    String firstAccess = first.at("/data/accessToken").asText();
    String firstRefresh = first.at("/data/refreshToken").asText();
    String secondAccess = second.at("/data/accessToken").asText();

    JsonNode logout = exchangeRaw("/auth/logout", HttpMethod.POST, null, firstAccess);
    assertThat(logout.get("code").asInt()).isZero();

    assertThat(
            exchangeRaw("/system/users/me", HttpMethod.GET, null, firstAccess).get("code").asInt())
        .isEqualTo(40100);
    assertThat(
            exchangeRaw("/system/users/me", HttpMethod.GET, null, secondAccess).get("code").asInt())
        .isEqualTo(40100);
    assertThat(
            exchangeRaw(
                    "/auth/refresh", HttpMethod.POST, Map.of("refreshToken", firstRefresh), null)
                .get("code")
                .asInt())
        .isEqualTo(40100);

    JsonNode repeated = exchangeRaw("/auth/logout", HttpMethod.POST, null, firstAccess);
    assertThat(repeated.get("code").asInt()).isEqualTo(40100);
  }

  @Test
  void redisCleanupFailureDoesNotRollBackDurableRevocation() {
    JsonNode login = login();
    String access = login.at("/data/accessToken").asText();
    String refresh = login.at("/data/refreshToken").asText();
    String poisonKey = OnlineUserRegistry.ONLINE_KEY_PREFIX + "poison";
    redisTemplate.opsForValue().set(poisonKey, "not-json");
    try {
      JsonNode logout = exchangeRaw("/auth/logout", HttpMethod.POST, null, access);
      assertThat(logout.get("code").asInt()).isZero();
    } finally {
      redisTemplate.delete(poisonKey);
    }

    assertThat(
            exchangeRaw("/auth/refresh", HttpMethod.POST, Map.of("refreshToken", refresh), null)
                .get("code")
                .asInt())
        .isEqualTo(40100);
  }

  private JsonNode login() {
    JsonNode body =
        exchangeRaw(
            "/auth/login",
            HttpMethod.POST,
            Map.of("username", "admin", "password", ADMIN_PASSWORD),
            null);
    assertThat(body.get("code").asInt()).isZero();
    return body;
  }
}
