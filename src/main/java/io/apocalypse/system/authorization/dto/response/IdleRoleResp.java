package io.apocalypse.system.authorization.dto.response;

/**
 * 闲置角色：{@code reason} 为 NO_MEMBERS（无成员）、NO_ACTIVE_GRANTS（计算时刻无生效业务授权）或 BOTH。 成员计数是角色关系的全量计数，不含用户资料。
 */
public record IdleRoleResp(
    Long roleId,
    String roleName,
    String roleKey,
    int status,
    long memberCount,
    long activeGrantCount,
    String reason) {}
