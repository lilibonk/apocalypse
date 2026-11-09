package io.apocalypse;

import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;

import static org.assertj.core.api.Assertions.assertThat;

import tools.jackson.databind.JsonNode;

/** 登录失败锁定集成测试：同一账号+来源 IP 连续 5 次错误密码后第 6 次直接返回 42901（账号临时锁定）； 不同来源 IP 互不锁死，防止攻击者跨 IP DoS 锁死合法用户。 */
class LoginSecurityIT extends AbstractIntegrationTest {

  private static final String LOCK_USER = "lockit";

  @Autowired private StringRedisTemplate stringRedisTemplate;

  @BeforeEach
  void cleanFailCounter() {
    Set<String> keys = stringRedisTemplate.keys("apoc:login:fail:" + LOCK_USER + "*");
    if (keys != null && !keys.isEmpty()) {
      stringRedisTemplate.delete(keys);
    }
  }

  @Test
  void fiveFailuresThenLockedAndOtherClientIpRemainsUnlocked() {
    for (int i = 0; i < 5; i++) {
      JsonNode body = loginWithForwardedFor("203.0.113.50");
      assertThat(body.get("code").asInt()).as("第 %d 次失败应返回 40100", i + 1).isEqualTo(40100);
    }

    JsonNode locked = loginWithForwardedFor("203.0.113.50");
    assertThat(locked.get("code").asInt()).as("同来源 IP 第 6 次应返回锁定码").isEqualTo(42901);

    JsonNode otherIpAttempt = loginWithForwardedFor("198.51.100.25");
    assertThat(otherIpAttempt.get("code").asInt()).as("另一真实客户端 IP 不应被连坐锁死").isEqualTo(40100);
  }

  private JsonNode loginWithForwardedFor(String clientIp) {
    HttpHeaders headers = new HttpHeaders();
    headers.set("X-Forwarded-For", clientIp);
    ResponseEntity<String> response =
        restTemplate.exchange(
            "/auth/login",
            HttpMethod.POST,
            new HttpEntity<>(Map.of("username", LOCK_USER, "password", "bad-password"), headers),
            String.class);
    assertThat(response.getStatusCode().value()).isEqualTo(200);
    return objectMapper.readTree(response.getBody());
  }
}
