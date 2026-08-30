package io.apocalypse.framework.cache;

import io.apocalypse.framework.redis.RedisKeyScanner;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Consumer;

import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.cache.Cache;
import org.springframework.cache.support.NullValue;
import org.springframework.cache.support.SimpleValueWrapper;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.serializer.SerializationException;
import org.springframework.util.Assert;

import com.github.benmanes.caffeine.cache.Caffeine;

import lombok.extern.slf4j.Slf4j;

/**
 * 两级缓存实现：L1=Caffeine（进程内），L2=Redis。
 *
 * <p>关键设计：
 *
 * <ul>
 *   <li>读路径：L1 → L2 → 回源（{@link #get(Object, Callable)} 使用 Redis 分布式锁 + 双重检查，防跨实例击穿）
 *   <li>空值以 Spring {@link NullValue} 哨兵写入两级（防穿透），由 allowNullValues 控制
 *   <li>L2 TTL = 基础值 × (1±jitter)，随机抖动防雪崩
 *   <li>evict/clear 递增 Redis 代数并广播失效；即使 Pub/Sub 消息丢失，实例也会主动比对代数并清理陈旧 L1
 *   <li>L2 key 带结构版本号（{@code apoc:v2:}），序列化不兼容变更时递增；L2 读取反序列化失败 （旧格式/损坏条目）按失效自愈：清毒条目 + 视为未命中回源，不再抛出
 *       500
 * </ul>
 */
@Slf4j
public class TwoLevelCache implements Cache {

  /**
   * L2 key 前缀：{@code apoc:v2:{cacheName}:{key}}。v2 启用显式类型 ID 信封；旧 v1 条目立即不可达并随 TTL
   * 自然过期，避免重部署后解析不受限类型元数据。
   */
  private static final String KEY_PREFIX = "apoc:v2:";

  private static final String VERSION_KEY_PREFIX = "apoc:cache:generation:";

  private static final String LOCK_KEY_PREFIX = "apoc:cache:rebuild:";

  private static final long GENERATION_CHECK_INTERVAL_NANOS = TimeUnit.SECONDS.toNanos(1);

  private final String name;

  private final CacheProperties properties;

  private final com.github.benmanes.caffeine.cache.Cache<Object, Object> l1;

  private final RedisTemplate<String, Object> l2;

  private final StringRedisTemplate redisStrings;

  private final RedissonClient redissonClient;

  private final Consumer<CacheInvalidateMessage> invalidationPublisher;

  private final String instanceId;

  private volatile long localGeneration;

  private final AtomicLong lastGenerationCheckNanos = new AtomicLong();

  public TwoLevelCache(
      String name,
      CacheProperties properties,
      RedisTemplate<String, Object> redisTemplate,
      StringRedisTemplate stringRedisTemplate,
      RedissonClient redissonClient,
      Consumer<CacheInvalidateMessage> invalidationPublisher,
      String instanceId) {
    this.name = name;
    this.properties = properties;
    this.l2 = redisTemplate;
    this.redisStrings = stringRedisTemplate;
    this.redissonClient = redissonClient;
    this.invalidationPublisher = invalidationPublisher;
    this.instanceId = instanceId;
    this.l1 =
        Caffeine.newBuilder()
            .maximumSize(properties.getL1().getMaxSize())
            .expireAfterWrite(Duration.ofSeconds(properties.getL1().getExpireSeconds()))
            .build();
    this.localGeneration = readGeneration();
  }

  @Override
  public String getName() {
    return name;
  }

  @Override
  public Object getNativeCache() {
    return this;
  }

  @Override
  public ValueWrapper get(Object key) {
    ensureFreshGeneration();
    // L1 命中直接返回（含空值哨兵）
    Object value = l1.getIfPresent(key);
    if (value != null) {
      return toWrapper(value);
    }
    // L2 命中则回填 L1；旧格式/损坏条目按失效自愈：清掉毒条目并视为未命中（回源重建）
    try {
      value = l2.opsForValue().get(redisKey(key));
    } catch (SerializationException e) {
      log.warn("缓存条目反序列化失败，已按失效处理并清除: cache={}, key={} ({})", name, key, e.getMessage());
      l2.delete(redisKey(key));
      return null;
    }
    if (value != null) {
      l1.put(key, value);
      return toWrapper(value);
    }
    return null;
  }

  @Override
  @SuppressWarnings("unchecked")
  public <T> T get(Object key, Class<T> type) {
    ValueWrapper wrapper = get(key);
    return wrapper == null ? null : (T) wrapper.get();
  }

  @Override
  @SuppressWarnings("unchecked")
  public <T> T get(Object key, Callable<T> valueLoader) {
    ValueWrapper wrapper = get(key);
    if (wrapper != null) {
      return (T) wrapper.get();
    }
    // Redis 分布式锁覆盖全部应用实例，双重检查避免并发重复回源
    RLock lock = redissonClient.getLock(LOCK_KEY_PREFIX + name + ':' + key);
    lock.lock();
    try {
      wrapper = get(key);
      if (wrapper != null) {
        return (T) wrapper.get();
      }
      T value = valueLoader.call();
      put(key, value);
      return value;
    } catch (Exception e) {
      throw new ValueRetrievalException(key, valueLoader, e);
    } finally {
      if (lock.isHeldByCurrentThread()) {
        lock.unlock();
      }
    }
  }

  @Override
  public void put(Object key, Object value) {
    Object storeValue = toStoreValue(value);
    l1.put(key, storeValue);
    l2.opsForValue().set(redisKey(key), storeValue, jitteredTtlSeconds(), TimeUnit.SECONDS);
  }

  @Override
  public void evict(Object key) {
    evictLocal(key);
    l2.delete(redisKey(key));
    long generation = incrementGeneration();
    invalidationPublisher.accept(
        new CacheInvalidateMessage(name, String.valueOf(key), instanceId, generation));
  }

  @Override
  public void clear() {
    clearLocal();
    RedisKeyScanner.delete(l2, KEY_PREFIX + name + ":*");
    long generation = incrementGeneration();
    invalidationPublisher.accept(new CacheInvalidateMessage(name, null, instanceId, generation));
  }

  /** 仅失效本实例 L1（供失效广播订阅方调用）。 */
  public void evictLocal(Object key) {
    l1.invalidate(key);
  }

  /** 仅清空本实例 L1（供失效广播订阅方调用）。 */
  public void clearLocal() {
    l1.invalidateAll();
  }

  /** 接收远端失效后同步代数；key 失效可精准清理，clear 则清空本地缓存。 */
  public void applyRemoteInvalidation(CacheInvalidateMessage message) {
    if (message.key() == null) {
      clearLocal();
    } else {
      evictLocal(message.key());
    }
    localGeneration = Math.max(localGeneration, message.generation());
  }

  private String redisKey(Object key) {
    return KEY_PREFIX + name + ':' + key;
  }

  private String generationKey() {
    return VERSION_KEY_PREFIX + name;
  }

  private long incrementGeneration() {
    Long generation = redisStrings.opsForValue().increment(generationKey());
    long resolved = generation == null ? readGeneration() : generation;
    localGeneration = resolved;
    return resolved;
  }

  private long readGeneration() {
    String value = redisStrings.opsForValue().get(generationKey());
    if (value == null) {
      return 0;
    }
    try {
      return Long.parseLong(value);
    } catch (NumberFormatException e) {
      return 0;
    }
  }

  private void ensureFreshGeneration() {
    long now = System.nanoTime();
    long previous = lastGenerationCheckNanos.get();
    if (now - previous < GENERATION_CHECK_INTERVAL_NANOS
        || !lastGenerationCheckNanos.compareAndSet(previous, now)) {
      return;
    }
    long remoteGeneration = readGeneration();
    if (remoteGeneration != localGeneration) {
      clearLocal();
      localGeneration = remoteGeneration;
    }
  }

  private Object toStoreValue(Object value) {
    if (value == null) {
      Assert.isTrue(
          properties.isAllowNullValues(),
          () -> "Cache '" + name + "' 不允许缓存 null 值（allowNullValues=false）");
      return NullValue.INSTANCE;
    }
    if (value instanceof List<?> list) {
      return new ArrayList<>(list);
    }
    return value;
  }

  private ValueWrapper toWrapper(Object storeValue) {
    // 空值哨兵解包为 null
    return new SimpleValueWrapper(storeValue instanceof NullValue ? null : storeValue);
  }

  /** 基础 TTL × (1±jitter)，防雪崩。 */
  private long jitteredTtlSeconds() {
    long base = properties.getL2().getExpireSeconds();
    double ratio = properties.getTtlJitterRatio();
    double jitter = 1 + ThreadLocalRandom.current().nextDouble(-ratio, ratio);
    return Math.max(1, Math.round(base * jitter));
  }
}
