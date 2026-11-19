package io.apocalypse.system.user;

import io.apocalypse.framework.web.JacksonConfig;
import io.apocalypse.system.user.dto.request.UserUpdateReq;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

import tools.jackson.databind.json.JsonMapper;

class UserUpdateReqTest {

  private final JsonMapper mapper = createMapper();

  @Test
  void omittedFieldsAndLegacyJavaNullsHaveTheSameIntent() {
    var omitted = mapper.readValue("{}", UserUpdateReq.class);
    var legacy = new UserUpdateReq(null, null, null);
    assertThat(omitted).isEqualTo(legacy);
    assertThat(omitted.nicknamePresent()).isFalse();
    assertThat(omitted.deptIdPresent()).isFalse();
    assertThat(mapper.writeValueAsString(legacy)).isEqualTo("{}");
    assertThat(new UserUpdateReq("   ", null, null)).isEqualTo(legacy);

    var changes = new UserUpdateReq("  新昵称  ", null, 11L);
    assertThat(changes.nicknamePresent()).isTrue();
    assertThat(changes.nickname()).isEqualTo("新昵称");
    assertThat(changes.deptIdPresent()).isTrue();
    var serialized = mapper.valueToTree(changes);
    assertThat(serialized)
        .isEqualTo(
            mapper.readTree(
                """
        {"nickname":"新昵称","deptId":"11"}
        """));
  }

  @ParameterizedTest
  @ValueSource(strings = {"null", "\"\"", "\"   \""})
  void explicitNullAndBlankNicknameRoundTripAsClear(String nickname) {
    var request =
        mapper.readValue(
            "{\"nickname\":" + nickname + ",\"deptId\":null,\"status\":null}", UserUpdateReq.class);
    assertThat(request.nickname()).isNull();
    assertThat(request.nicknamePresent()).isTrue();
    assertThat(request.deptId()).isNull();
    assertThat(request.deptIdPresent()).isTrue();
    assertThat(request.status()).isNull();
    var json = mapper.valueToTree(request);
    assertThat(json.propertyNames()).containsExactlyInAnyOrder("nickname", "deptId");
    assertThat(json.path("nickname").isNull()).isTrue();
    assertThat(json.path("deptId").isNull()).isTrue();
    assertThat(mapper.treeToValue(json, UserUpdateReq.class)).isEqualTo(request);
  }

  @Test
  void departmentSupportsBothSnowflakeFormsAndOnlyLiteralNullClears() {
    for (String deptId : new String[] {"9007199254740997", "\"9007199254740997\""}) {
      var request = mapper.readValue("{\"deptId\":" + deptId + "}", UserUpdateReq.class);
      assertThat(request.deptIdPresent()).isTrue();
      assertThat(request.deptId()).isEqualTo(9_007_199_254_740_997L);
    }
    var coerced = mapper.readValue("{\"deptId\":\"\"}", UserUpdateReq.class);
    assertThat(coerced.deptId()).isNull();
    assertThat(coerced.deptIdPresent()).isFalse();
  }

  private static JsonMapper createMapper() {
    var builder = JsonMapper.builder();
    new JacksonConfig().apocalypseJacksonCustomizer().customize(builder);
    return builder.build();
  }
}
