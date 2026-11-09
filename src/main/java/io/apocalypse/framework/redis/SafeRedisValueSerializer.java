package io.apocalypse.framework.redis;

import io.apocalypse.framework.security.OnlineUserRegistry;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.cache.support.NullValue;
import org.springframework.data.redis.serializer.RedisSerializer;
import org.springframework.data.redis.serializer.SerializationException;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** 显式类型 ID 的 Redis JSON 序列化器。反序列化从已登记的模块注册表选类型，从不采信载荷中的 Java class 名。 */
final class SafeRedisValueSerializer implements RedisSerializer<Object> {

  private static final Set<String> RESERVED_TYPE_IDS =
      Set.of("string", "null-value", "online-user", "string-list", "empty-list");

  private static final RedisCacheTypeRegistration DEFAULT_SYSTEM_REGISTRATION =
      RedisCacheTypeRegistration.builder()
          .singleClassName("user-response", "io.apocalypse.system.user.dto.response.UserResp")
          .listClassName("dict-data-list", "io.apocalypse.system.dict.dto.response.DictDataResp")
          .singleClassName(
              "login-insight", "io.apocalypse.system.log.dto.response.LoginInsightResp")
          .singleClassName(
              "login-heatmap", "io.apocalypse.system.log.dto.response.LoginHeatmapResp")
          .build();

  private final ObjectMapper objectMapper;

  private final Map<String, RedisCacheTypeRegistration.Entry> byTypeId;

  private final Map<String, String> singleTypeIdByClass;

  private final Map<String, String> listTypeIdByElementClass;

  SafeRedisValueSerializer(ObjectMapper objectMapper) {
    this(objectMapper, List.of(DEFAULT_SYSTEM_REGISTRATION));
  }

  SafeRedisValueSerializer(
      ObjectMapper objectMapper, List<RedisCacheTypeRegistration> registrations) {
    this.objectMapper = objectMapper;
    List<RedisCacheTypeRegistration> effective =
        (registrations == null || registrations.isEmpty())
            ? List.of(DEFAULT_SYSTEM_REGISTRATION)
            : registrations;
    Map<String, RedisCacheTypeRegistration.Entry> typeMap = new LinkedHashMap<>();
    Map<String, String> singleMap = new LinkedHashMap<>();
    Map<String, String> listMap = new LinkedHashMap<>();
    for (RedisCacheTypeRegistration registration : effective) {
      for (RedisCacheTypeRegistration.Entry entry : registration.entries()) {
        if (RESERVED_TYPE_IDS.contains(entry.typeId())) {
          throw new IllegalArgumentException(
              "Redis cache typeId is reserved by framework: " + entry.typeId());
        }
        RedisCacheTypeRegistration.Entry existing = typeMap.putIfAbsent(entry.typeId(), entry);
        if (existing != null && !existing.equals(entry)) {
          throw new IllegalArgumentException(
              "Duplicate Redis cache typeId registration: " + entry.typeId());
        }
        if (entry.list()) {
          listMap.put(entry.className(), entry.typeId());
        } else {
          singleMap.put(entry.className(), entry.typeId());
        }
      }
    }
    this.byTypeId = Map.copyOf(typeMap);
    this.singleTypeIdByClass = Map.copyOf(singleMap);
    this.listTypeIdByElementClass = Map.copyOf(listMap);
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
        case "string-list" -> stringList(requiredArray(value));
        case "empty-list" -> List.of();
        default -> {
          RedisCacheTypeRegistration.Entry entry = byTypeId.get(type);
          if (entry == null) {
            throw new SerializationException("Unknown Redis value type id: " + type);
          }
          if (entry.list()) {
            yield objectList(requiredArray(value), entry.className());
          }
          yield objectMapper.treeToValue(required(value), registeredClass(entry.className()));
        }
      };
    } catch (SerializationException e) {
      throw e;
    } catch (Exception e) {
      throw new SerializationException("Could not read registered Redis value", e);
    }
  }

  private String typeId(Object value) {
    if (value instanceof String) {
      return "string";
    }
    if (value instanceof NullValue) {
      return "null-value";
    }
    if (value instanceof OnlineUserRegistry.OnlineUser) {
      return "online-user";
    }
    String singleTypeId = singleTypeIdByClass.get(value.getClass().getName());
    if (singleTypeId != null) {
      return singleTypeId;
    }
    if (value instanceof List<?> list) {
      if (list.isEmpty()) {
        return "empty-list";
      }
      if (list.stream().allMatch(String.class::isInstance)) {
        return "string-list";
      }
      Object first = list.getFirst();
      if (first != null) {
        String elementClass = first.getClass().getName();
        String listTypeId = listTypeIdByElementClass.get(elementClass);
        if (listTypeId != null
            && list.stream()
                .allMatch(item -> item != null && elementClass.equals(item.getClass().getName()))) {
          return listTypeId;
        }
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

  private Class<?> registeredClass(String className) throws ClassNotFoundException {
    if (!singleTypeIdByClass.containsKey(className)
        && !listTypeIdByElementClass.containsKey(className)) {
      throw new SerializationException("Redis value class is not registered: " + className);
    }
    return Class.forName(className);
  }
}
