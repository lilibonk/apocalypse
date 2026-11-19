package io.apocalypse.system.user.dto.request;

import io.apocalypse.system.user.infrastructure.json.UserUpdateReqJson;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

import com.fasterxml.jackson.annotation.JsonIgnore;

import io.swagger.v3.oas.annotations.media.Schema;
import tools.jackson.databind.annotation.JsonDeserialize;
import tools.jackson.databind.annotation.JsonSerialize;

/** 用户更新请求。省略字段时保留原值。 */
@JsonDeserialize(using = UserUpdateReqJson.Deserializer.class)
@JsonSerialize(using = UserUpdateReqJson.Serializer.class)
public record UserUpdateReq(
    @Size(max = 64, message = "昵称最长 64 字符")
        @Schema(nullable = true, description = "省略时保留，null 或仅空白时清空")
        String nickname,
    @Min(value = 0, message = "状态仅支持 0/1")
        @Max(value = 1, message = "状态仅支持 0/1")
        @Schema(nullable = true, description = "省略或传 null 时保留原状态")
        Integer status,
    @Schema(nullable = true, description = "省略时保留，仅全部数据范围的操作者可传 null 清空") Long deptId,
    @JsonIgnore @Schema(hidden = true) boolean nicknamePresent,
    @JsonIgnore @Schema(hidden = true) boolean deptIdPresent) {

  public UserUpdateReq(String nickname, Integer status, Long deptId) {
    this(nickname, status, deptId, nickname != null && !nickname.isBlank(), deptId != null);
  }

  public UserUpdateReq {
    if (nickname != null) {
      nickname = nickname.strip();
      if (nickname.isEmpty()) {
        nickname = null;
      }
    }
  }
}
