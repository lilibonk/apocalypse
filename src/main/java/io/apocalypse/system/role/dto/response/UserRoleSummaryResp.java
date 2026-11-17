package io.apocalypse.system.role.dto.response;

/** 用户关联的角色只读摘要投影（供跨子域聚合展示“账号 → 角色 → 默认数据范围”）。 */
public record UserRoleSummaryResp(
    Long id, String roleName, String roleKey, Integer status, String dataScope) {}
