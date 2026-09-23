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
}
