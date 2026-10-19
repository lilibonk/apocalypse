package io.apocalypse;

import io.apocalypse.framework.cache.TwoLevelCache;
import io.apocalypse.framework.cache.TwoLevelCacheManager;

import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.Cache;
import org.springframework.data.redis.core.RedisTemplate;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 按缓存名的最大年龄（{@code apocalypse.cache.caches.<name>.max-age-seconds}）：L2 TTL 不超过上限、L2 命中不回填
 * L1，未配置的缓存保持全局 TTL 与回填行为。{@code log-insight} 在测试配置中为 60 秒。
 */
class CacheMaxAgeIT extends AbstractIntegrationTest {

  private static final String BOUNDED = "log-insight";

  private static final String UNBOUNDED = "it-cache-unbounded";

  @Autowired private TwoLevelCacheManager cacheManager;

  @Autowired private RedisTemplate<String, Object> redisTemplate;

  @AfterEach
  void cleanUp() {
    cache(BOUNDED).evict("it-probe");
    cache(UNBOUNDED).evict("it-probe");
  }

  @Test
  void boundedCacheNeverStoresBeyondItsMaxAge() {
    for (int i = 0; i < 20; i++) {
      cache(BOUNDED).put("it-probe", "v" + i);
      Long ttl = redisTemplate.getExpire(l2Key(BOUNDED), TimeUnit.SECONDS);
      assertThat(ttl).isBetween(1L, 60L);
    }
    cache(UNBOUNDED).put("it-probe", "v");
    // 全局 L2 1800 秒 ± 20% 抖动保持不变。
    assertThat(redisTemplate.getExpire(l2Key(UNBOUNDED), TimeUnit.SECONDS)).isBetween(1440L, 2160L);
  }

  @Test
  void boundedCacheDoesNotRefillL1FromAnEntryOfUnknownAge() {
    Cache bounded = cache(BOUNDED);
    bounded.put("it-probe", "computed");
    ((TwoLevelCache) bounded).clearLocal();
    // L2 命中仍返回值……
    assertThat(bounded.get("it-probe", String.class)).isEqualTo("computed");
    redisTemplate.delete(l2Key(BOUNDED));
    // ……但没有回填 L1：L2 过期后不会再从本地层返回更旧的值。
    assertThat(bounded.get("it-probe")).isNull();

    Cache unbounded = cache(UNBOUNDED);
    unbounded.put("it-probe", "computed");
    ((TwoLevelCache) unbounded).clearLocal();
    assertThat(unbounded.get("it-probe", String.class)).isEqualTo("computed");
    redisTemplate.delete(l2Key(UNBOUNDED));
    // 未配置上限的缓存沿用原行为：L2 命中已回填 L1。
    assertThat(unbounded.get("it-probe", String.class)).isEqualTo("computed");
  }

  private Cache cache(String name) {
    Cache cache = cacheManager.getCache(name);
    assertThat(cache).isNotNull();
    return cache;
  }

  private static String l2Key(String cacheName) {
    return "apoc:v2:" + cacheName + ":it-probe";
  }
}
