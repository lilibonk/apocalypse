package io.apocalypse.system.role.dto.response;

/** 角色下用户响应（角色-用户管理列表）。 */
public record RoleUserResp(Long id, String username, String nickname, Integer status) {}
