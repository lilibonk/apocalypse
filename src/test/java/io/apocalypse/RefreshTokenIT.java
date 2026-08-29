package io.apocalypse;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

import static org.assertj.core.api.Assertions.assertThat;

import tools.jackson.databind.JsonNode;

/**
 * refresh token 生命周期集成测试：登录签发双令牌 → /auth/refresh 旋转换新（新 access 可用、旧 refresh 重放命中黑名单 40100）→
 * 强退在线条目后关联 refresh 联动拉黑（40100）。 refresh token 结构（type=refresh 独立 jti + atj 关联 access jti）见
 * AuthService。
 */
class RefreshTokenIT extends AbstractIntegrationTest {

  @Test
  void refreshRotatesPairAndNewAccessTokenWorks() {
    JsonNode login = login("admin", "admin123");
    String accessToken = login.at("/data/accessToken").asText();
    String refreshToken = login.at("/data/refreshToken").asText();
    assertThat(accessToken).isNotBlank();
    assertThat(refreshToken).isNotBlank();
    assertThat(login.at("/data/expiresIn").asLong()).as("应返回 expiresIn").isPositive();

    JsonNode rotated = refresh(refreshToken);
    assertThat(rotated.get("code").asInt()).as("refresh 应成功: %s", rotated).isEqualTo(0);
    String newAccessToken = rotated.at("/data/accessToken").asText();
    String newRefreshToken = rotated.at("/data/refreshToken").asText();
    assertThat(newAccessToken).isNotBlank().isNotEqualTo(accessToken);
    assertThat(newRefreshToken).isNotBlank().isNotEqualTo(refreshToken);

    // 新 access token 可调受保护端点
    JsonNode me = getForData("/system/users/me", newAccessToken);
    assertThat(me.at("/user/username").asText()).isEqualTo("admin");
  }

  @Test
  void replayedOldRefreshTokenReturns40100() {
    String refreshToken = login("admin", "admin123").at("/data/refreshToken").asText();

    assertThat(refresh(refreshToken).get("code").asInt()).as("首次 refresh 应成功").isEqualTo(0);

    // 旋转后旧 refresh jti 已入黑名单，重放必须 40100
    JsonNode replay = refresh(refreshToken);
    assertThat(replay.get("code").asInt()).as("旧 refresh 重放应被旋转检测拒绝").isEqualTo(40100);
  }

  @Test
  void refreshAfterKickReturns40100() {
    JsonNode login = login("admin", "admin123");
    String accessToken = login.at("/data/accessToken").asText();
    String refreshToken = login.at("/data/refreshToken").asText();

    // 强退本次会话（access jti）：在线条目删除，access 与关联 refresh jti 联动拉黑
    deleteForData("/system/online-users/" + extractJti(accessToken), accessToken);

    JsonNode body = refresh(refreshToken);
    assertThat(body.get("code").asInt()).as("强退后 refresh 应被拒绝").isEqualTo(40100);
  }

  /** 账密登录并断言成功，返回完整 R 节点。 */
  private JsonNode login(String username, String password) {
    JsonNode body =
        exchangeRaw(
            "/auth/login",
            HttpMethod.POST,
            Map.of("username", username, "password", password),
            null);
    assertThat(body.get("code").asInt()).as("登录应成功: %s", body).isEqualTo(0);
    return body;
  }

  /** 调 /auth/refresh，返回完整 R 节点（调用方自行断言业务码）。 */
  private JsonNode refresh(String refreshToken) {
    return exchangeRaw(
        "/auth/refresh", HttpMethod.POST, Map.of("refreshToken", refreshToken), null);
  }

  /** 从 JWT 载荷段解出 jti（仅 base64url 解码，不验签——测试自证用途）。 */
  private String extractJti(String token) {
    String payload =
        new String(Base64.getUrlDecoder().decode(token.split("\\.")[1]), StandardCharsets.UTF_8);
    return objectMapper.readTree(payload).get("jti").asText();
  }
}
