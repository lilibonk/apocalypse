package io.apocalypse.framework.cache;

import java.util.Collection;
import java.util.UUID;
import java.util.function.Consumer;

import org.springframework.cache.Cache;
import org.springframework.cache.support.AbstractCacheManager;
import org.springframework.data.redis.core.RedisTemplate;

import lombok.extern.slf4j.Slf4j;

/** 两级缓存管理器：按 name 懒创建 {@link TwoLevelCache}。 同时承担失效广播的发布职责（注入订阅方共用的 instanceId，跳过本实例消息）。 */
@Slf4j
public class TwoLevelCacheManager extends AbstractCacheManager {

  private final CacheProperties properties;

  private final RedisTemplate<String, Object> redisTemplate;

  private final Consumer<CacheInvalidateMessage> invalidationPublisher;

  private final String instanceId;

  public TwoLevelCacheManager(
      CacheProperties properties,
      RedisTemplate<String, Object> redisTemplate,
      Consumer<CacheInvalidateMessage> invalidationPublisher) {
    this.properties = properties;
    this.redisTemplate = redisTemplate;
    this.invalidationPublisher = invalidationPublisher;
    // 实例 ID：启动时生成，供失效广播去重（跳过本实例消息）
    this.instanceId = UUID.randomUUID().toString();
  }

  @Override
  protected Collection<? extends Cache> loadCaches() {
    return java.util.List.of();
  }

  @Override
  protected Cache getMissingCache(String name) {
    return new TwoLevelCache(name, properties, redisTemplate, invalidationPublisher, instanceId);
  }

  /** 处理远端实例的失效广播：仅清本地 L1（最终一致语义，不保证强一致）。 */
  public void onInvalidateMessage(CacheInvalidateMessage message) {
    if (instanceId.equals(message.sourceInstanceId())) {
      return;
    }
    Cache cache = getCache(message.cacheName());
    if (cache instanceof TwoLevelCache twoLevelCache) {
      if (message.key() == null) {
        twoLevelCache.clearLocal();
      } else {
        twoLevelCache.evictLocal(message.key());
      }
    }
  }
}
