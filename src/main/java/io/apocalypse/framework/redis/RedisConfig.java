package io.apocalypse.framework.redis;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.serializer.StringRedisSerializer;

import tools.jackson.databind.ObjectMapper;

/** Redis 装配。 RedissonClient 由 redisson-spring-boot-starter 自动装配，此处不重复创建。 */
@Configuration
public class RedisConfig {

  /**
   * 缓存/在线用户专用 RedisTemplate：key 用 String，value 使用显式类型 ID 信封，不接受 JSON class 元数据。 计数、代次和黑名单使用
   * StringRedisTemplate，避免与对象序列化边界混用。
   */
  @Bean
  public RedisTemplate<String, Object> redisTemplate(
      RedisConnectionFactory connectionFactory, ObjectMapper objectMapper) {
    RedisTemplate<String, Object> template = new RedisTemplate<>();
    template.setConnectionFactory(connectionFactory);
    StringRedisSerializer stringSerializer = new StringRedisSerializer();
    SafeRedisValueSerializer valueSerializer = new SafeRedisValueSerializer(objectMapper);
    template.setKeySerializer(stringSerializer);
    template.setHashKeySerializer(stringSerializer);
    template.setValueSerializer(valueSerializer);
    template.setHashValueSerializer(valueSerializer);
    template.afterPropertiesSet();
    return template;
  }
}
