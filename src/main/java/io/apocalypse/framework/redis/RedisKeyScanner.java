package io.apocalypse.framework.redis;

import java.util.LinkedHashSet;
import java.util.Set;

import org.springframework.data.redis.core.Cursor;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ScanOptions;

/** 基于 SCAN 的非阻塞 key 遍历，统一替代生产代码中的 Redis KEYS。 */
public final class RedisKeyScanner {

  private static final long BATCH_SIZE = 500;

  private RedisKeyScanner() {}

  public static Set<String> scan(RedisTemplate<String, ?> redisTemplate, String pattern) {
    Set<String> keys = new LinkedHashSet<>();
    ScanOptions options = ScanOptions.scanOptions().match(pattern).count(BATCH_SIZE).build();
    try (Cursor<String> cursor = redisTemplate.scan(options)) {
      cursor.forEachRemaining(keys::add);
      return keys;
    }
  }

  public static long delete(RedisTemplate<String, ?> redisTemplate, String pattern) {
    long deleted = 0;
    try (Cursor<String> cursor =
        redisTemplate.scan(ScanOptions.scanOptions().match(pattern).count(BATCH_SIZE).build())) {
      Set<String> batch = new LinkedHashSet<>();
      while (cursor.hasNext()) {
        batch.add(cursor.next());
        if (batch.size() >= BATCH_SIZE) {
          deleted += deleteBatch(redisTemplate, batch);
          batch.clear();
        }
      }
      return deleted + deleteBatch(redisTemplate, batch);
    }
  }

  private static long deleteBatch(RedisTemplate<String, ?> redisTemplate, Set<String> keys) {
    if (keys.isEmpty()) {
      return 0;
    }
    Long count = redisTemplate.delete(keys);
    return count == null ? 0 : count;
  }
}
