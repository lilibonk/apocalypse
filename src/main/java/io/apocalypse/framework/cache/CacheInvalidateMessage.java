package io.apocalypse.framework.cache;

/**
 * 缓存失效广播消息（发布到 Redis 频道 {@code apoc:cache:invalidate}）。
 *
 * @param cacheName 缓存名
 * @param key 失效的 key；为 {@code null} 表示 clear 整个缓存
 * @param sourceInstanceId 来源实例 ID，接收方据此跳过本实例发出的消息
 * @param generation Redis 中单调递增的缓存代数；订阅消息丢失时，实例可主动比对并清理陈旧 L1
 */
public record CacheInvalidateMessage(
    String cacheName, String key, String sourceInstanceId, long generation) {

  /** 失效广播频道。 */
  public static final String CHANNEL = "apoc:cache:invalidate";
}
