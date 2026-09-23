package io.apocalypse;

import io.apocalypse.framework.cache.CacheProperties;
import io.apocalypse.framework.cache.TwoLevelCache;
import io.apocalypse.framework.cache.TwoLevelCacheManager;
import io.apocalypse.system.config.entity.SysConfigEntity;
import io.apocalypse.system.config.mapper.SysConfigMapper;
import io.apocalypse.system.config.service.ConfigConvert;
import io.apocalypse.system.config.service.ConfigService;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.redisson.api.RedissonClient;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.annotation.AnnotationCacheOperationSource;
import org.springframework.cache.interceptor.CacheInterceptor;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.StringRedisTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** 使用生产 ConfigService 注解和真实 Spring 代理，验证独立缓存管理器间的分布式回源互斥。 */
class CacheRebuildConcurrencyIT extends AbstractIntegrationTest {

  @Autowired private RedisTemplate<String, Object> redisTemplate;

  @Autowired private StringRedisTemplate stringRedisTemplate;

  @Autowired private RedissonClient redissonClient;

  @Test
  void productionAnnotationSerializesColdLoadsAcrossTwoManagers() throws Exception {
    String key = "it-concurrent-config-" + UUID.randomUUID();
    SysConfigMapper source = mock(SysConfigMapper.class);
    AtomicInteger sourceCalls = new AtomicInteger();
    CountDownLatch loading = new CountDownLatch(1);
    CountDownLatch release = new CountDownLatch(1);
    SysConfigEntity entity = new SysConfigEntity();
    entity.setConfigValue("value");
    when(source.findByKey(key))
        .thenAnswer(
            invocation -> {
              sourceCalls.incrementAndGet();
              loading.countDown();
              assertThat(release.await(10, TimeUnit.SECONDS)).isTrue();
              return Optional.of(entity);
            });
    ConfigService first = proxy(source);
    ConfigService second = proxy(source);
    CountDownLatch start = new CountDownLatch(1);
    CountDownLatch started = new CountDownLatch(8);
    try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
      List<Future<String>> calls = new ArrayList<>();
      for (int index = 0; index < 8; index++) {
        ConfigService service = index % 2 == 0 ? first : second;
        calls.add(
            executor.submit(
                () -> {
                  start.await();
                  started.countDown();
                  return service.get(key);
                }));
      }
      try {
        start.countDown();
        assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
        assertThat(loading.await(5, TimeUnit.SECONDS)).isTrue();
        await()
            .during(Duration.ofMillis(300))
            .atMost(Duration.ofSeconds(3))
            .untilAsserted(() -> assertThat(sourceCalls).hasValue(1));
        release.countDown();
        for (Future<String> call : calls) {
          assertThat(call.get(10, TimeUnit.SECONDS)).isEqualTo("value");
        }
        assertThat(sourceCalls).hasValue(1);
      } finally {
        release.countDown();
      }
    } finally {
      redisTemplate.delete("apoc:v2:config:" + key);
    }
  }

  @Test
  void productionSyncAnnotationRetainsCachedNullAcrossManagers() {
    String key = "it-null-config-" + UUID.randomUUID();
    SysConfigMapper source = mock(SysConfigMapper.class);
    AtomicInteger calls = new AtomicInteger();
    when(source.findByKey(key))
        .thenAnswer(
            invocation -> {
              calls.incrementAndGet();
              return Optional.empty();
            });
    try {
      assertThat(proxy(source).get(key)).isNull();
      assertThat(proxy(source).get(key)).isNull();
      assertThat(calls).hasValue(1);
    } finally {
      redisTemplate.delete("apoc:v2:config:" + key);
    }
  }

  @ParameterizedTest
  @ValueSource(booleans = {false, true})
  void remoteInvalidationDuringLoaderCannotResurrectStaleL2(boolean clearRegion) throws Exception {
    String name = "it-loader-generation-" + UUID.randomUUID();
    TwoLevelCache loadingCache = (TwoLevelCache) manager().getCache(name);
    TwoLevelCache remoteCache = (TwoLevelCache) manager().getCache(name);
    assertThat(loadingCache).isNotNull();
    assertThat(remoteCache).isNotNull();
    CountDownLatch loading = new CountDownLatch(1);
    CountDownLatch release = new CountDownLatch(1);
    try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
      var inflight =
          executor.submit(
              () ->
                  loadingCache.get(
                      "key",
                      () -> {
                        loading.countDown();
                        assertThat(release.await(10, TimeUnit.SECONDS)).isTrue();
                        return "stale";
                      }));
      try {
        assertThat(loading.await(5, TimeUnit.SECONDS)).isTrue();
        // The independent managers deliberately drop Pub/Sub: Redis generation is authoritative.
        if (clearRegion) {
          remoteCache.clear();
        } else {
          remoteCache.evict("key");
        }
        release.countDown();
        assertThat(inflight.get(10, TimeUnit.SECONDS)).isEqualTo("stale");
        assertThat(redisTemplate.hasKey("apoc:v2:" + name + ":key")).isFalse();
        assertThat(loadingCache.get("key", () -> "fresh")).isEqualTo("fresh");
        loadingCache.clearLocal();
        assertThat(loadingCache.get("key", String.class)).isEqualTo("fresh");
        assertThat(remoteCache.get("key", String.class)).isEqualTo("fresh");
      } finally {
        release.countDown();
      }
    } finally {
      redisTemplate.delete("apoc:v2:" + name + ":key");
      stringRedisTemplate.delete("apoc:cache:generation:" + name);
    }
  }

  private ConfigService proxy(SysConfigMapper source) {
    TwoLevelCacheManager manager = manager();
    CacheInterceptor interceptor = new CacheInterceptor();
    interceptor.setCacheManager(manager);
    interceptor.setCacheOperationSource(new AnnotationCacheOperationSource());
    interceptor.afterPropertiesSet();
    interceptor.afterSingletonsInstantiated();
    ProxyFactory factory = new ProxyFactory(new ConfigService(source, mock(ConfigConvert.class)));
    factory.addAdvice(interceptor);
    return (ConfigService) factory.getProxy();
  }

  private TwoLevelCacheManager manager() {
    TwoLevelCacheManager manager =
        new TwoLevelCacheManager(
            new CacheProperties(),
            redisTemplate,
            stringRedisTemplate,
            redissonClient,
            message -> {});
    manager.afterPropertiesSet();
    return manager;
  }
}
