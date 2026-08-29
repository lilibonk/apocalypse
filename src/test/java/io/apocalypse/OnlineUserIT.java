package io.apocalypse;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

import static org.assertj.core.api.Assertions.assertThat;

import tools.jackson.databind.JsonNode;

/** 在线用户与强退集成测试：登录注册在线条目（jti）→ 列表可见 → 强退 → 原 token 被黑名单拦截（40100）。 */
class OnlineUserIT extends AbstractIntegrationTest {

  @Test
  void loginThenKickThenTokenRejected() {
    String token = loginAndGetToken("admin", "admin123");
    String jti = extractJti(token);

    // 在线列表应包含本次会话的 jti
    JsonNode onlineUsers = getForData("/system/online-users", token);
    assertThat(onlineUsers.isArray()).isTrue();
    JsonNode self = findByJti(onlineUsers, jti);
    assertThat(self).as("在线用户列表应包含本次登录的 jti").isNotNull();
    assertThat(self.get("username").asText()).isEqualTo("admin");

    // 强退：删在线条目 + jti 写入黑名单
    deleteForData("/system/online-users/" + jti, token);

    // 原 token 再调受保护端点：命中黑名单，返回 40100
    JsonNode body = exchangeRaw("/system/users/me", HttpMethod.GET, null, token);
    assertThat(body.get("code").asInt()).isEqualTo(40100);
  }

  /** 从 JWT 载荷段解出 jti（仅 base64url 解码，不验签——测试自证用途）。 */
  private String extractJti(String token) {
    String payload =
        new String(Base64.getUrlDecoder().decode(token.split("\\.")[1]), StandardCharsets.UTF_8);
    return objectMapper.readTree(payload).get("jti").asText();
  }

  private static JsonNode findByJti(JsonNode onlineUsers, String jti) {
    for (JsonNode node : onlineUsers) {
      if (jti.equals(node.get("jti").asText())) {
        return node;
      }
    }
    return null;
  }
}
