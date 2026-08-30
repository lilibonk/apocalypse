package io.apocalypse.framework.redis;

import io.apocalypse.framework.security.OnlineUserRegistry;

import java.util.ArrayList;
import java.util.List;

import org.springframework.cache.support.NullValue;
import org.springframework.data.redis.serializer.RedisSerializer;
import org.springframework.data.redis.serializer.SerializationException;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** 显式类型 ID 的 Redis JSON 序列化器。反序列化从固定注册表选类型，从不采信载荷中的 Java class 名。 */
final class SafeRedisValueSerializer implements RedisSerializer<Object> {

  private static final String USER_RESPONSE_CLASS =
      "io.apocalypse.system.user.dto.response.UserResp";

  private static final String DICT_DATA_RESPONSE_CLASS =
      "io.apocalypse.system.dict.dto.response.DictDataResp";

  private final ObjectMapper objectMapper;

  SafeRedisValueSerializer(ObjectMapper objectMapper) {
    this.objectMapper = objectMapper;
  }

  @Override
  public byte[] serialize(Object value) throws SerializationException {
    if (value == null) {
      return new byte[0];
    }
    try {
      String type = typeId(value);
      ObjectNode envelope = objectMapper.createObjectNode();
      envelope.put("type", type);
      if (!"null-value".equals(type)) {
        envelope.set("value", objectMapper.valueToTree(value));
      }
      return objectMapper.writeValueAsBytes(envelope);
    } catch (Exception e) {
      throw new SerializationException("Redis value type is not registered", e);
    }
  }

  @Override
  public Object deserialize(byte[] bytes) throws SerializationException {
    if (bytes == null || bytes.length == 0) {
      return null;
    }
    try {
      JsonNode envelope = objectMapper.readTree(bytes);
      String type = envelope.path("type").asText();
      JsonNode value = envelope.get("value");
      return switch (type) {
        case "string" -> required(value).asText();
        case "null-value" -> NullValue.INSTANCE;
        case "online-user" ->
            objectMapper.treeToValue(required(value), OnlineUserRegistry.OnlineUser.class);
        case "user-response" ->
            objectMapper.treeToValue(required(value), registeredClass(USER_RESPONSE_CLASS));
        case "string-list" -> stringList(requiredArray(value));
        case "dict-data-list" -> objectList(requiredArray(value), DICT_DATA_RESPONSE_CLASS);
        case "empty-list" -> List.of();
        default -> throw new SerializationException("Unknown Redis value type id: " + type);
      };
    } catch (SerializationException e) {
      throw e;
    } catch (Exception e) {
      throw new SerializationException("Could not read registered Redis value", e);
    }
  }

  private static String typeId(Object value) {
    if (value instanceof String) {
      return "string";
    }
    if (value instanceof NullValue) {
      return "null-value";
    }
    if (value instanceof OnlineUserRegistry.OnlineUser) {
      return "online-user";
    }
    if (USER_RESPONSE_CLASS.equals(value.getClass().getName())) {
      return "user-response";
    }
    if (value instanceof List<?> list) {
      if (list.isEmpty()) {
        return "empty-list";
      }
      if (list.stream().allMatch(String.class::isInstance)) {
        return "string-list";
      }
      if (list.stream()
          .allMatch(item -> DICT_DATA_RESPONSE_CLASS.equals(item.getClass().getName()))) {
        return "dict-data-list";
      }
    }
    throw new SerializationException(
        "Unregistered Redis value class: " + value.getClass().getName());
  }

  private static JsonNode required(JsonNode value) {
    if (value == null || value.isNull()) {
      throw new SerializationException("Registered Redis value is missing");
    }
    return value;
  }

  private static JsonNode requiredArray(JsonNode value) {
    JsonNode required = required(value);
    if (!required.isArray()) {
      throw new SerializationException("Registered Redis list value is not an array");
    }
    return required;
  }

  private static List<String> stringList(JsonNode value) {
    List<String> result = new ArrayList<>();
    value.forEach(item -> result.add(item.asText()));
    return result;
  }

  private List<Object> objectList(JsonNode value, String className) throws Exception {
    Class<?> itemClass = registeredClass(className);
    List<Object> result = new ArrayList<>();
    for (JsonNode item : value) {
      result.add(objectMapper.treeToValue(item, itemClass));
    }
    return result;
  }

  private static Class<?> registeredClass(String className) throws ClassNotFoundException {
    if (!USER_RESPONSE_CLASS.equals(className) && !DICT_DATA_RESPONSE_CLASS.equals(className)) {
      throw new SerializationException("Redis value class is not registered: " + className);
    }
    return Class.forName(className);
  }
}
