package io.apocalypse.system.user.infrastructure.json;

import io.apocalypse.system.user.dto.request.UserUpdateReq;

import tools.jackson.core.JsonGenerator;
import tools.jackson.core.JsonParser;
import tools.jackson.core.JsonToken;
import tools.jackson.databind.DeserializationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.SerializationContext;
import tools.jackson.databind.ValueDeserializer;
import tools.jackson.databind.ValueSerializer;

/** 用户更新 JSON 保留省略与显式 null 的区别。 */
public final class UserUpdateReqJson {

  private UserUpdateReqJson() {}

  public static final class Deserializer extends ValueDeserializer<UserUpdateReq> {
    @Override
    public UserUpdateReq deserialize(JsonParser parser, DeserializationContext context) {
      if (!parser.hasToken(JsonToken.START_OBJECT)) {
        return (UserUpdateReq) context.handleUnexpectedToken(UserUpdateReq.class, parser);
      }
      JsonNode json = context.readTree(parser);
      Fields fields = context.readTreeAsValue(json, Fields.class);
      return new UserUpdateReq(
          fields.nickname(),
          fields.status(),
          fields.deptId(),
          fields.nickname() != null || json.path("nickname").isNull(),
          fields.deptId() != null || json.path("deptId").isNull());
    }
  }

  public static final class Serializer extends ValueSerializer<UserUpdateReq> {
    @Override
    public void serialize(
        UserUpdateReq request, JsonGenerator generator, SerializationContext context) {
      generator.writeStartObject();
      if (request.nicknamePresent()) {
        context.defaultSerializeProperty("nickname", request.nickname(), generator);
      }
      if (request.status() != null) {
        context.defaultSerializeProperty("status", request.status(), generator);
      }
      if (request.deptIdPresent()) {
        context.defaultSerializeProperty("deptId", request.deptId(), generator);
      }
      generator.writeEndObject();
    }
  }

  private record Fields(String nickname, Integer status, Long deptId) {}
}
