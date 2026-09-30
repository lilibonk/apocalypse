package io.apocalypse;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.redisson.api.RedissonClient;
import org.redisson.spring.data.connection.RedissonConnectionFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.StringRedisTemplate;

import static org.assertj.core.api.Assertions.assertThat;

/** 运行实例与资源证据：缓存/会话模板共用 Redisson 工厂，starter 精简不得悄悄装配第二条连接路径。 */
class RedisRuntimeOwnershipIT extends AbstractIntegrationTest {
  @Autowired private ApplicationContext context;
  @Autowired private RedissonClient redisson;
  @Autowired private RedisTemplate<String, Object> redisTemplate;
  @Autowired private StringRedisTemplate stringRedisTemplate;

  @Test
  void templatesAndDistributedLocksUseOneRedissonFactoryWithoutLettuceResources() throws Exception {
    var factories = context.getBeansOfType(RedisConnectionFactory.class);
    assertThat(factories).hasSize(1);
    RedisConnectionFactory factory = factories.values().iterator().next();
    assertThat(factory).isInstanceOf(RedissonConnectionFactory.class);
    assertThat(redisTemplate.getConnectionFactory()).isSameAs(factory);
    assertThat(stringRedisTemplate.getConnectionFactory()).isSameAs(factory);
    assertThat(context.getBeansOfType(RedissonClient.class)).hasSize(1);
    assertThat(context.getBeansOfType(Object.class).values())
        .noneMatch(bean -> bean.getClass().getName().startsWith("io.lettuce."))
        .noneMatch(bean -> bean.getClass().getName().contains("LettuceConnectionFactory"));
    String key = "it:redis-runtime:" + UUID.randomUUID();
    try {
      stringRedisTemplate.opsForValue().set(key, "single-runtime");
      assertThat(
              redisson.<String>getBucket(key, org.redisson.client.codec.StringCodec.INSTANCE).get())
          .isEqualTo("single-runtime");
      try (var connection = factory.getConnection()) {
        assertThat(connection.ping()).isEqualTo("PONG");
      }
    } finally {
      stringRedisTemplate.delete(key);
    }
  }
}
