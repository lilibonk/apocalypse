package io.apocalypse.system.role.dto.response;

/** 角色响应。 */
public record RoleResp(
    Long id, String roleName, String roleKey, Integer sort, Integer status, String remark) {}
