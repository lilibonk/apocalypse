package io.apocalypse.framework.redis;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.serializer.GenericJacksonJsonRedisSerializer;
import org.springframework.data.redis.serializer.StringRedisSerializer;

/** Redis 装配。 RedissonClient 由 redisson-spring-boot-starter 自动装配，此处不重复创建。 */
@Configuration
public class RedisConfig {

  /**
   * 通用 RedisTemplate：key/hashKey 用 String 序列化，value/hashValue 用 JSON。
   *
   * <p>选用 Jackson 3 版 {@link GenericJacksonJsonRedisSerializer}：Jackson 3 内置 Java 8 时间支持（Jackson 2
   * 版 需额外 jsr310 模块，缓存含 {@code LocalDateTime} 的 DTO 会序列化失败）。
   *
   * <p>安全取舍说明：{@code enableUnsafeDefaultTyping} 会在 JSON 中写入多态类型信息（{@code @class}），反序列化时
   * 可还原任意类——仅适用于内网可信数据；若 Redis 数据可能被外部污染，需替换为不带类型信息的序列化器或加白名单校验。
   */
  @Bean
  public RedisTemplate<String, Object> redisTemplate(RedisConnectionFactory connectionFactory) {
    RedisTemplate<String, Object> template = new RedisTemplate<>();
    template.setConnectionFactory(connectionFactory);
    StringRedisSerializer stringSerializer = new StringRedisSerializer();
    GenericJacksonJsonRedisSerializer jsonSerializer =
        GenericJacksonJsonRedisSerializer.builder().enableUnsafeDefaultTyping().build();
    template.setKeySerializer(stringSerializer);
    template.setHashKeySerializer(stringSerializer);
    template.setValueSerializer(jsonSerializer);
    template.setHashValueSerializer(jsonSerializer);
    template.afterPropertiesSet();
    return template;
  }
}
