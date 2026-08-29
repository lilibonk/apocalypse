package io.apocalypse;

import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpMethod;

import static org.assertj.core.api.Assertions.assertThat;

import tools.jackson.databind.JsonNode;

/**
 * 登录失败锁定集成测试：同一账号连续 5 次错误密码后第 6 次直接返回 42901（账号临时锁定）。 用不存在的账号（lockit）做锁定验证，避免污染 admin 的失败计数影响其他用例。
 */
class LoginSecurityIT extends AbstractIntegrationTest {

  private static final String LOCK_USER = "lockit";

  @Autowired private StringRedisTemplate stringRedisTemplate;

  @BeforeEach
  void cleanFailCounter() {
    stringRedisTemplate.delete("apoc:login:fail:" + LOCK_USER);
  }

  @Test
  void fiveFailuresThenLocked() {
    for (int i = 0; i < 5; i++) {
      JsonNode body =
          exchangeRaw(
              "/auth/login",
              HttpMethod.POST,
              Map.of("username", LOCK_USER, "password", "bad-password"),
              null);
      assertThat(body.get("code").asInt()).as("第 %d 次失败应返回 40100", i + 1).isEqualTo(40100);
    }

    JsonNode locked =
        exchangeRaw(
            "/auth/login",
            HttpMethod.POST,
            Map.of("username", LOCK_USER, "password", "bad-password"),
            null);
    assertThat(locked.get("code").asInt()).as("第 6 次应返回锁定码").isEqualTo(42901);
  }
}
