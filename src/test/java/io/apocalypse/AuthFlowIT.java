package io.apocalypse;

import java.time.Duration;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import tools.jackson.databind.JsonNode;

/**
 * 认证链路集成测试：登录签发、/me 取数、未认证统一 40100、错误密码业务码； 登录成功/失败经事件驱动异步落 sys_login_log（Awaitility 轮询）； refresh
 * 双令牌旋转与 dev 环境 CORS 预检。
 */
class AuthFlowIT extends AbstractIntegrationTest {

  @Test
  void adminLoginThenMeReturnsRolesPermsMenus() {
    String token = loginAndGetToken("admin", "admin123");

    JsonNode me = getForData("/system/users/me", token);

    assertThat(me.at("/user/username").asText()).isEqualTo("admin");
    assertThat(me.at("/roles").isEmpty()).as("roles 应非空").isFalse();
    assertThat(me.at("/perms").isEmpty()).as("perms 应非空").isFalse();
    assertThat(me.at("/menus").isEmpty()).as("menus 应非空").isFalse();

    // 登录成功后应异步落一条成功登录日志
    awaitLoginLog("admin", 1);
  }

  @Test
  void protectedEndpointWithoutTokenReturns40100() {
    JsonNode body = exchangeRaw("/system/users/me", HttpMethod.GET, null, null);

    assertThat(body.get("code").asInt()).isEqualTo(40100);
    assertThat(body.get("message").asText()).isNotBlank();
  }

  @Test
  void wrongPasswordReturns40100() {
    JsonNode body =
        exchangeRaw(
            "/auth/login",
            HttpMethod.POST,
            Map.of("username", "admin", "password", "bad-password"),
            null);

    assertThat(body.get("code").asInt()).isEqualTo(40100);

    // 登录失败应异步落一条失败登录日志
    awaitLoginLog("admin", 0);
  }

  /** refresh 旋转：登录得双令牌 → 换新对 → 新 access token 可用 → 旧 refresh 再用命中黑名单（40100）。 */
  @Test
  void loginIssuesTokenPairAndRefreshRotates() {
    JsonNode login =
        exchangeRaw(
            "/auth/login",
            HttpMethod.POST,
            Map.of("username", "admin", "password", "admin123"),
            null);
    assertThat(login.get("code").asInt()).as("登录应成功: %s", login).isEqualTo(0);
    String accessToken = login.at("/data/accessToken").asText();
    String refreshToken = login.at("/data/refreshToken").asText();
    assertThat(accessToken).isNotBlank();
    assertThat(refreshToken).as("登录应同时签发 refreshToken").isNotBlank();

    // refresh token 不携带权限，不能冒充访问令牌调受保护端点
    JsonNode misuse = exchangeRaw("/system/users/me", HttpMethod.GET, null, refreshToken);
    assertThat(misuse.get("code").asInt()).as("refresh token 不应能访问受保护端点").isEqualTo(40100);

    JsonNode rotated =
        exchangeRaw("/auth/refresh", HttpMethod.POST, Map.of("refreshToken", refreshToken), null);
    assertThat(rotated.get("code").asInt()).as("refresh 应成功: %s", rotated).isEqualTo(0);
    String newAccessToken = rotated.at("/data/accessToken").asText();
    String newRefreshToken = rotated.at("/data/refreshToken").asText();
    assertThat(newAccessToken).isNotBlank().isNotEqualTo(accessToken);
    assertThat(newRefreshToken).isNotBlank().isNotEqualTo(refreshToken);

    // 新 access token 可调 /system/users/me
    JsonNode me = getForData("/system/users/me", newAccessToken);
    assertThat(me.at("/user/username").asText()).isEqualTo("admin");

    // 旧 refresh token 重复使用：旋转后其 jti 已入黑名单
    JsonNode reuse =
        exchangeRaw("/auth/refresh", HttpMethod.POST, Map.of("refreshToken", refreshToken), null);
    assertThat(reuse.get("code").asInt()).as("旧 refresh token 应已被旋转作废").isEqualTo(40100);
  }

  /** CORS 预检：dev 环境放行本地前端 5173 来源（IT 上下文激活 dev profile）。 */
  @Test
  void corsPreflightAllowsConfiguredDevOrigin() {
    HttpHeaders headers = new HttpHeaders();
    headers.setOrigin("http://localhost:5173");
    headers.setAccessControlRequestMethod(HttpMethod.POST);

    ResponseEntity<String> response =
        restTemplate.exchange(
            "/auth/login", HttpMethod.OPTIONS, new HttpEntity<>(null, headers), String.class);

    assertThat(response.getStatusCode().value()).as("预检应放行").isEqualTo(200);
    assertThat(response.getHeaders().getAccessControlAllowOrigin())
        .isEqualTo("http://localhost:5173");
  }

  /** Awaitility 轮询 sys_login_log 直至出现指定成功标记的记录（事件驱动异步落库）。 */
  private void awaitLoginLog(String username, int success) {
    await()
        .atMost(Duration.ofSeconds(15))
        .untilAsserted(
            () -> {
              Integer count =
                  jdbcTemplate.queryForObject(
                      "SELECT COUNT(*) FROM sys_login_log WHERE username = ? AND success = ?",
                      Integer.class,
                      username,
                      success);
              assertThat(count).as("sys_login_log 应有记录").isNotNull().isGreaterThan(0);
            });
  }
}
