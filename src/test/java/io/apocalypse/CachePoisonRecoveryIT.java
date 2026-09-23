package io.apocalypse;

import io.apocalypse.framework.cache.TwoLevelCache;
import io.apocalypse.framework.cache.TwoLevelCacheManager;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.Cache;
import org.springframework.data.redis.core.StringRedisTemplate;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 两级缓存「毒条目自愈」的端到端回归测试。
 *
 * <p>场景：重部署后 L2 中残留旧格式/损坏的序列化数据（真实事故：旧构建写入的缓存 JSON 与新构建 反序列化器不兼容，DictService.getByType 抛
 * SerializationException 变 500）。 期望行为：读取按失效处理——清掉毒条目、视为未命中回源重建，接口不再 500。
 */
class CachePoisonRecoveryIT extends AbstractIntegrationTest {

  @Autowired private TwoLevelCacheManager cacheManager;

  @Autowired private StringRedisTemplate stringRedisTemplate;

  @Test
  void poisonedL2EntryIsDroppedAndReloaded() {
    Cache cache = cacheManager.getCache("it-poison");
    assertThat(cache).isNotNull();
    // 模拟旧构建残留的不可反序列化条目（裸写一段非 JSON 垃圾字节）
    stringRedisTemplate.opsForValue().set("apoc:v2:it-poison:k1", "{not-valid-json");
    assertThat(stringRedisTemplate.opsForValue().get("apoc:v2:it-poison:k1"))
        .isEqualTo("{not-valid-json");

    // 读取不抛异常、按未命中处理；带回源的读取应回源重建成功
    assertThat(cache.get("k1", String.class)).isNull();
    assertThat(stringRedisTemplate.hasKey("apoc:v2:it-poison:k1")).isFalse();
    assertThat(cache.get("k1", () -> "healed")).isEqualTo("healed");

    // 毒条目已被重建值覆盖：L1 清空后读取落到 L2，稳定拿到 healed
    ((TwoLevelCache) cache).evictLocal("k1");
    assertThat(cache.get("k1", String.class)).isEqualTo("healed");
  }
}
