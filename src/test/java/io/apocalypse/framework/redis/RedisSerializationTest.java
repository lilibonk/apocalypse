package io.apocalypse.framework.redis;

import io.apocalypse.framework.security.OnlineUserRegistry;
import io.apocalypse.system.dict.dto.response.DictDataResp;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.data.redis.serializer.SerializationException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import tools.jackson.databind.ObjectMapper;

/** Redis 多态白名单回归：合法缓存类型可往返，未知 class 元数据在实例化前拒绝。 */
class RedisSerializationTest {

  @Test
  void allowedOnlineUserAndResponseListRoundTrip() {
    SafeRedisValueSerializer serializer = new SafeRedisValueSerializer(new ObjectMapper());
    OnlineUserRegistry.OnlineUser onlineUser =
        new OnlineUserRegistry.OnlineUser(
            "admin", LocalDateTime.of(2026, 8, 30, 12, 0), "127.0.0.1", "test", "refresh");
    List<DictDataResp> responses = List.of(new DictDataResp(1L, "status", "启用", "1", 1, 1, null));

    assertThat(serializer.deserialize(serializer.serialize(onlineUser))).isEqualTo(onlineUser);
    assertThat(serializer.deserialize(serializer.serialize(responses))).isEqualTo(responses);
  }

  @Test
  void unknownPolymorphicTypeIsRejected() {
    SafeRedisValueSerializer restricted = new SafeRedisValueSerializer(new ObjectMapper());
    byte[] attackerControlledPayload =
        "{\"type\":\"java.io.File\",\"value\":{\"path\":\"type-probe\"}}"
            .getBytes(StandardCharsets.UTF_8);

    assertThatThrownBy(() -> restricted.deserialize(attackerControlledPayload))
        .isInstanceOf(SerializationException.class);
  }
}
