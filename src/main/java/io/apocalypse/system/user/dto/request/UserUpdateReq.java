package io.apocalypse.system.user.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

import io.swagger.v3.oas.annotations.media.Schema;

/** 用户更新请求（字段均可选，仅更新非空字段）。 */
public record UserUpdateReq(
    @Size(max = 64, message = "昵称最长 64 字符") String nickname,
    @Min(value = 0, message = "状态仅支持 0/1") @Max(value = 1, message = "状态仅支持 0/1") Integer status,
    @Schema(nullable = true) Long deptId) {}
