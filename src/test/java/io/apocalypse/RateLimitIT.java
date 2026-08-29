package io.apocalypse;

import java.util.HashSet;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureTestRestTemplate;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpMethod;

import static org.assertj.core.api.Assertions.assertThat;

import tools.jackson.databind.JsonNode;

/**
 * 限流集成测试：独立上下文（login 限流覆盖为 2/min），同一来源第 3 次登录应返回 42900。 限流器 Redis key
 * 带速率状态（已存在不覆盖），每个用例前后清理，避免污染共享容器中的其他 IT。
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {"apocalypse.ratelimit.limits.login=2"})
@AutoConfigureTestRestTemplate
class RateLimitIT extends AbstractIntegrationTest {

  @Autowired private StringRedisTemplate stringRedisTemplate;

  /**
   * 清理登录限流器状态。Redisson RRateLimiter 用三个 Redis 键：配置键 {@code apoc:rl:login:{ip}} 与许可状态键 {@code
   * {apoc:rl:login:{ip}}:value} / {@code {...}:permits}（花括号是集群 hash-tag 包装，不带前缀），
   * 后两者必须按名推导一并删除，否则共享容器中残留的许可会让本用例的低速率形同虚设。
   */
  @BeforeEach
  @AfterEach
  void cleanRateLimitKeys() {
    Set<String> configKeys = stringRedisTemplate.keys("apoc:rl:login:*");
    if (configKeys == null || configKeys.isEmpty()) {
      return;
    }
    Set<String> keys = new HashSet<>(configKeys);
    configKeys.forEach(
        key -> {
          keys.add("{" + key + "}:value");
          keys.add("{" + key + "}:permits");
        });
    stringRedisTemplate.delete(keys);
  }

  @Test
  void thirdLoginWithinWindowReturns42900() {
    Map<String, String> loginBody = Map.of("username", "admin", "password", "admin123");
    assertThat(exchangeRaw("/auth/login", HttpMethod.POST, loginBody, null).get("code").asInt())
        .isEqualTo(0);
    assertThat(exchangeRaw("/auth/login", HttpMethod.POST, loginBody, null).get("code").asInt())
        .isEqualTo(0);

    JsonNode third = exchangeRaw("/auth/login", HttpMethod.POST, loginBody, null);
    assertThat(third.get("code").asInt()).as("窗口内第 3 次应被限流").isEqualTo(42900);
  }
}
