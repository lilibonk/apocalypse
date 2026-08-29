package io.apocalypse.framework.cache;

import java.time.Duration;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Consumer;

import org.springframework.cache.Cache;
import org.springframework.cache.support.NullValue;
import org.springframework.cache.support.SimpleValueWrapper;
import org.springframework.data.redis.core.RedisTemplate;
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
 *   <li>读路径：L1 → L2 → 回源（{@link #get(Object, Callable)} 按 key 分段加锁 + 双重检查，防击穿）
 *   <li>空值以 Spring {@link NullValue} 哨兵写入两级（防穿透），由 allowNullValues 控制
 *   <li>L2 TTL = 基础值 × (1±jitter)，随机抖动防雪崩
 *   <li>evict/clear 除本地两级外，通过 {@code invalidationPublisher} 广播失效消息； 其他实例收到后仅清本地 L1——最终一致语义，不保证强一致
 *   <li>L2 key 带结构版本号（{@code apoc:v1:}），序列化不兼容变更时递增；L2 读取反序列化失败 （旧格式/损坏条目）按失效自愈：清毒条目 + 视为未命中回源，不再抛出
 *       500
 * </ul>
 */
@Slf4j
public class TwoLevelCache implements Cache {

  /**
   * L2 key 前缀：{@code apoc:v1:{cacheName}:{key}}。v1 为缓存结构版本号——value 序列化结构发生
   * 不兼容变更时递增（v2、v3…），旧版本条目立即不可达并随 TTL 自然过期，避免重部署后读到旧格式缓存。
   */
  private static final String KEY_PREFIX = "apoc:v1:";

  private final String name;

  private final CacheProperties properties;

  private final com.github.benmanes.caffeine.cache.Cache<Object, Object> l1;

  private final RedisTemplate<String, Object> l2;

  private final Consumer<CacheInvalidateMessage> invalidationPublisher;

  private final String instanceId;

  /** 按 key 分段的互斥锁，用于回源重建的防击穿。 */
  private final ConcurrentMap<String, ReentrantLock> rebuildLocks = new ConcurrentHashMap<>();

  public TwoLevelCache(
      String name,
      CacheProperties properties,
      RedisTemplate<String, Object> redisTemplate,
      Consumer<CacheInvalidateMessage> invalidationPublisher,
      String instanceId) {
    this.name = name;
    this.properties = properties;
    this.l2 = redisTemplate;
    this.invalidationPublisher = invalidationPublisher;
    this.instanceId = instanceId;
    this.l1 =
        Caffeine.newBuilder()
            .maximumSize(properties.getL1().getMaxSize())
            .expireAfterWrite(Duration.ofSeconds(properties.getL1().getExpireSeconds()))
            .build();
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
    // 按 key 分段加锁回源（防击穿），双重检查避免重复加载
    String lockKey = String.valueOf(key);
    ReentrantLock lock = rebuildLocks.computeIfAbsent(lockKey, k -> new ReentrantLock());
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
      lock.unlock();
      rebuildLocks.remove(lockKey, lock);
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
    invalidationPublisher.accept(new CacheInvalidateMessage(name, String.valueOf(key), instanceId));
  }

  @Override
  public void clear() {
    clearLocal();
    // 脚手架用 keys 匹配删除，数据量大时生产环境应替换为 SCAN 分批
    Set<String> keys = l2.keys(KEY_PREFIX + name + ":*");
    if (keys != null && !keys.isEmpty()) {
      l2.delete(keys);
    }
    invalidationPublisher.accept(new CacheInvalidateMessage(name, null, instanceId));
  }

  /** 仅失效本实例 L1（供失效广播订阅方调用）。 */
  public void evictLocal(Object key) {
    l1.invalidate(key);
  }

  /** 仅清空本实例 L1（供失效广播订阅方调用）。 */
  public void clearLocal() {
    l1.invalidateAll();
  }

  private String redisKey(Object key) {
    return KEY_PREFIX + name + ':' + key;
  }

  private Object toStoreValue(Object value) {
    if (value == null) {
      Assert.isTrue(
          properties.isAllowNullValues(),
          () -> "Cache '" + name + "' 不允许缓存 null 值（allowNullValues=false）");
      return NullValue.INSTANCE;
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
