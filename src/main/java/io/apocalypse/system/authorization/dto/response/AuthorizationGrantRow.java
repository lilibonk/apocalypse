package io.apocalypse.system.authorization.dto.response;

import java.time.Instant;

/** 单条 SQL 返回的身份、撤销代次、角色和 grant 投影，不向其他子域暴露持久化实体。 */
public record AuthorizationGrantRow(
    Long userId,
    String username,
    Long departmentId,
    String departmentIds,
    long globalVersion,
    long userVersion,
    long credentialVersion,
    Long roleId,
    String roleKey,
    String roleScope,
    Long permissionId,
    String code,
    String moduleKey,
    String lifecycle,
    String scopeOverride,
    Instant validFrom,
    Instant validUntil) {}
