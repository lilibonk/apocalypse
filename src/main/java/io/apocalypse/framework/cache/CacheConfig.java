package io.apocalypse.framework.cache;

import java.nio.charset.StandardCharsets;

import org.redisson.api.RedissonClient;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;

import lombok.extern.slf4j.Slf4j;
import tools.jackson.databind.ObjectMapper;

/** 两级缓存装配：注册 @Primary {@link CacheManager}，并订阅失效广播频道。 失效语义为最终一致（evict 时广播，其他实例清本地 L1），不保证强一致。 */
@Slf4j
@Configuration
@EnableCaching
@EnableConfigurationProperties(CacheProperties.class)
public class CacheConfig {

  @Bean
  @Primary
  public TwoLevelCacheManager cacheManager(
      CacheProperties properties,
      RedisTemplate<String, Object> redisTemplate,
      RedissonClient redissonClient,
      StringRedisTemplate stringRedisTemplate,
      ObjectMapper objectMapper) {
    // 失效广播走 StringRedisTemplate：频道载荷为纯 JSON 文本。
    // 若用 RedisTemplate<String,Object> 发送已序列化的 JSON 字符串，会被 value 序列化器二次编码，
    // 订阅方解析失败（历史 bug，已由 CacheInvalidationIT 回归覆盖）。
    return new TwoLevelCacheManager(
        properties,
        redisTemplate,
        stringRedisTemplate,
        redissonClient,
        message ->
            stringRedisTemplate.convertAndSend(
                CacheInvalidateMessage.CHANNEL, objectMapper.writeValueAsString(message)));
  }

  /** 订阅 {@code apoc:cache:invalidate}：远端实例的 evict/clear 触发本实例清 L1。 */
  @Bean
  public RedisMessageListenerContainer cacheInvalidateListener(
      RedisConnectionFactory connectionFactory,
      TwoLevelCacheManager cacheManager,
      ObjectMapper objectMapper) {
    RedisMessageListenerContainer container = new RedisMessageListenerContainer();
    container.setConnectionFactory(connectionFactory);
    container.addMessageListener(
        (message, pattern) -> {
          try {
            String body = new String(message.getBody(), StandardCharsets.UTF_8);
            cacheManager.onInvalidateMessage(
                objectMapper.readValue(body, CacheInvalidateMessage.class));
          } catch (Exception e) {
            log.warn("缓存失效广播消息解析失败，已忽略: {}", e.getMessage());
          }
        },
        new ChannelTopic(CacheInvalidateMessage.CHANNEL));
    return container;
  }
}
