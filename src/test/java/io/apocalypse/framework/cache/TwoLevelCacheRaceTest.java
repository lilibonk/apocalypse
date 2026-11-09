package io.apocalypse.framework.cache;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;
import org.redisson.api.RedissonClient;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TwoLevelCacheRaceTest {

  @Test
  @SuppressWarnings("unchecked")
  void invalidationDuringL2ReadPreventsStaleL1Refill() throws Exception {
    RedisTemplate<String, Object> redis = mock(RedisTemplate.class);
    ValueOperations<String, Object> values = mock(ValueOperations.class);
    StringRedisTemplate strings = mock(StringRedisTemplate.class);
    ValueOperations<String, String> generations = mock(ValueOperations.class);
    when(redis.opsForValue()).thenReturn(values);
    when(strings.opsForValue()).thenReturn(generations);
    when(generations.get("apoc:cache:generation:race")).thenReturn("0");
    CountDownLatch reading = new CountDownLatch(1);
    CountDownLatch resume = new CountDownLatch(1);
    AtomicInteger reads = new AtomicInteger();
    when(values.get("apoc:v2:race:42"))
        .thenAnswer(
            invocation -> {
              if (reads.incrementAndGet() == 1) {
                reading.countDown();
                assertThat(resume.await(10, TimeUnit.SECONDS)).isTrue();
                return "old";
              }
              return "new";
            });
    TwoLevelCache cache =
        new TwoLevelCache(
            "race",
            new CacheProperties(),
            redis,
            strings,
            mock(RedissonClient.class),
            message -> {},
            "local");

    try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
      var inflight = executor.submit(() -> cache.get(42L, String.class));
      try {
        assertThat(reading.await(10, TimeUnit.SECONDS)).isTrue();
        cache.applyRemoteInvalidation(new CacheInvalidateMessage("race", "42", "remote", 1));
        resume.countDown();
        assertThat(inflight.get(10, TimeUnit.SECONDS)).isEqualTo("old");
        assertThat(cache.get(42L, String.class)).isEqualTo("new");
        assertThat(reads).hasValue(2);
      } finally {
        resume.countDown();
      }
    }
  }

  @Test
  @SuppressWarnings("unchecked")
  void sequentialSingleKeyRemoteInvalidationDoesNotEvictSiblingL1Entries() {
    RedisTemplate<String, Object> redis = mock(RedisTemplate.class);
    ValueOperations<String, Object> values = mock(ValueOperations.class);
    StringRedisTemplate strings = mock(StringRedisTemplate.class);
    ValueOperations<String, String> generations = mock(ValueOperations.class);
    when(redis.opsForValue()).thenReturn(values);
    when(strings.opsForValue()).thenReturn(generations);
    when(generations.get("apoc:cache:generation:users")).thenReturn("0");
    when(values.get("apoc:v2:users:1")).thenReturn("user-1-v1", "user-1-v2");
    when(values.get("apoc:v2:users:2")).thenReturn("user-2-v1", "user-2-should-not-reload");

    TwoLevelCache cache =
        new TwoLevelCache(
            "users",
            new CacheProperties(),
            redis,
            strings,
            mock(RedissonClient.class),
            message -> {},
            "local");

    // Populate L1 for both keys
    assertThat(cache.get(1L, String.class)).isEqualTo("user-1-v1");
    assertThat(cache.get(2L, String.class)).isEqualTo("user-2-v1");

    // Invalidate only key 1 with sequential generation 1
    cache.applyRemoteInvalidation(new CacheInvalidateMessage("users", "1", "remote", 1));

    // Key 1 reloads from L2, while key 2 stays in L1 without hitting L2 again
    assertThat(cache.get(1L, String.class)).isEqualTo("user-1-v2");
    assertThat(cache.get(2L, String.class)).isEqualTo("user-2-v1");
  }
}
