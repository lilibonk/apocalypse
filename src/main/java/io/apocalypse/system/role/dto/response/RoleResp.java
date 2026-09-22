package io.apocalypse.system.role.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;

/** 角色响应。 */
public record RoleResp(
    Long id,
    String roleName,
    String roleKey,
    Integer sort,
    Integer status,
    @Schema(nullable = true) String remark) {}
