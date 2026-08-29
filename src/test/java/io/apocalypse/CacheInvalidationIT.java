package io.apocalypse;

import io.apocalypse.framework.cache.CacheInvalidateMessage;
import io.apocalypse.framework.cache.TwoLevelCacheManager;

import java.time.Duration;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.Cache;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.StringRedisTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import tools.jackson.databind.ObjectMapper;

/**
 * 两级缓存跨实例失效广播的端到端回归测试。
 *
 * <p>历史 bug：发布方把已序列化的 JSON 字符串交给 {@code RedisTemplate<String,Object>} 发送， 被 value
 * 序列化器二次编码，订阅方解析失败静默吞掉，跨实例 L1 失效实际不生效。 本测试走真实 Redis 频道全链路（序列化 → 发布 → 订阅解析 → 清 L1）防回归。
 */
class CacheInvalidationIT extends AbstractIntegrationTest {

  @Autowired private TwoLevelCacheManager cacheManager;

  @Autowired private RedisTemplate<String, Object> redisTemplate;

  @Autowired private StringRedisTemplate stringRedisTemplate;

  @Autowired private ObjectMapper objectMapper;

  @Test
  void remoteInvalidateMessageEvictsLocalL1() {
    Cache cache = cacheManager.getCache("it-cache");
    assertThat(cache).isNotNull();
    // L1/L2 都写入 v1
    cache.put("k1", "v1");
    // 模拟另一实例把 L2 直接改成 v2（绕过本实例 L1）
    redisTemplate.opsForValue().set("apoc:v1:it-cache:k1", "v2");
    // 本实例读到的是 L1 旧值
    assertThat(cache.get("k1", String.class)).isEqualTo("v1");
    // 通过真实频道发布一条来自其他实例的失效消息
    stringRedisTemplate.convertAndSend(
        CacheInvalidateMessage.CHANNEL,
        objectMapper.writeValueAsString(
            new CacheInvalidateMessage("it-cache", "k1", "other-instance")));
    // L1 被清后，读取落到 L2 的 v2
    await()
        .atMost(Duration.ofSeconds(5))
        .untilAsserted(() -> assertThat(cache.get("k1", String.class)).isEqualTo("v2"));
  }
}
