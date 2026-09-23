package io.apocalypse;

import io.apocalypse.framework.cache.CacheInvalidateMessage;
import io.apocalypse.framework.cache.TwoLevelCache;
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
    // L1/L2 都写入 v2
    cache.put("k1", "v1");
    // 模拟另一实例把 L2 直接改成 v2（绕过本实例 L1）
    redisTemplate.opsForValue().set("apoc:v2:it-cache:k1", "v2");
    // 本实例读到的是 L1 旧值
    assertThat(cache.get("k1", String.class)).isEqualTo("v1");
    // 通过真实频道发布一条来自其他实例的失效消息
    stringRedisTemplate.opsForValue().set("apoc:cache:generation:it-cache", "1");
    stringRedisTemplate.convertAndSend(
        CacheInvalidateMessage.CHANNEL,
        objectMapper.writeValueAsString(
            new CacheInvalidateMessage("it-cache", "k1", "other-instance", 1)));
    // L1 被清后，读取落到 L2 的 v2
    await()
        .atMost(Duration.ofSeconds(5))
        .untilAsserted(() -> assertThat(cache.get("k1", String.class)).isEqualTo("v2"));
  }

  @Test
  void generationCheckRepairsMissedPubSubInvalidation() {
    Cache cache = cacheManager.getCache("it-cache-missed-message");
    assertThat(cache).isNotNull();
    cache.put("k1", "v1");
    assertThat(cache.get("k1", String.class)).isEqualTo("v1");

    // 模拟实例离线期间错过 Pub/Sub：只更新 L2 与代数，不发送消息。
    redisTemplate.opsForValue().set("apoc:v2:it-cache-missed-message:k1", "v2");
    stringRedisTemplate.opsForValue().increment("apoc:cache:generation:it-cache-missed-message");

    await()
        .pollDelay(Duration.ofSeconds(1))
        .atMost(Duration.ofSeconds(5))
        .untilAsserted(() -> assertThat(cache.get("k1", String.class)).isEqualTo("v2"));
  }

  @Test
  void stringEncodedBroadcastAlsoEvictsLongKey() {
    TwoLevelCache cache = (TwoLevelCache) cacheManager.getCache("it-cache-long-key");
    assertThat(cache).isNotNull();
    cache.put(42L, "old");
    assertThat(cache.get(42L, String.class)).isEqualTo("old");
    redisTemplate.opsForValue().set("apoc:v2:it-cache-long-key:42", "new");
    stringRedisTemplate.opsForValue().set("apoc:cache:generation:it-cache-long-key", "1");
    cacheManager.onInvalidateMessage(
        new CacheInvalidateMessage("it-cache-long-key", "42", "remote", 1));
    assertThat(cache.get(42L, String.class)).isEqualTo("new");
  }

  @Test
  void laterAndOutOfOrderMessagesCannotMaskAnEarlierMissedInvalidation() {
    String name = "it-cache-generation-gap";
    TwoLevelCache cache = (TwoLevelCache) cacheManager.getCache(name);
    assertThat(cache).isNotNull();
    cache.put("first", "old-first");
    cache.put("second", "old-second");
    assertThat(cache.get("first", String.class)).isEqualTo("old-first");
    redisTemplate.opsForValue().set("apoc:v2:" + name + ":first", "new-first");
    redisTemplate.opsForValue().set("apoc:v2:" + name + ":second", "new-second");
    stringRedisTemplate.opsForValue().set("apoc:cache:generation:" + name, "2");
    // Generation 1 (first) is lost; only generation 2 (second) arrives.
    cache.applyRemoteInvalidation(new CacheInvalidateMessage(name, "second", "remote", 2));
    assertThat(cache.get("first", String.class)).isEqualTo("new-first");
    assertThat(cache.get("second", String.class)).isEqualTo("new-second");
    cache.applyRemoteInvalidation(new CacheInvalidateMessage(name, "first", "remote", 1));
    cache.applyRemoteInvalidation(new CacheInvalidateMessage(name, "second", "remote", 2));
    assertThat(cache.get("first", String.class)).isEqualTo("new-first");
  }

  @Test
  void localGenerationAdvanceAlsoClearsMissedRemoteInvalidation() {
    String name = "it-cache-local-generation-gap";
    Cache cache = cacheManager.getCache(name);
    assertThat(cache).isNotNull();
    cache.put("remote-key", "old");
    cache.put("local-key", "local");
    assertThat(cache.get("remote-key", String.class)).isEqualTo("old");
    redisTemplate.opsForValue().set("apoc:v2:" + name + ":remote-key", "new");
    stringRedisTemplate.opsForValue().increment("apoc:cache:generation:" + name);
    cache.evict("local-key");
    assertThat(cache.get("remote-key", String.class)).isEqualTo("new");
  }
}
