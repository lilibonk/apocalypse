package io.apocalypse.system.user.dto.response;

import java.time.LocalDateTime;

import io.swagger.v3.oas.annotations.media.Schema;

/** 用户响应（deptName 由 Service 装配，非实体字段）。 */
public record UserResp(
    Long id,
    String username,
    @Schema(nullable = true) String nickname,
    Integer status,
    @Schema(nullable = true) Long deptId,
    @Schema(nullable = true) String deptName,
    LocalDateTime createTime) {}
