package io.apocalypse.system.authorization.dto.response;

import java.time.Instant;
import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 某权限的一条角色授予配置及其在计算时刻的状态：ACTIVE、NOT_STARTED、EXPIRED、PAUSED、ROLE_DISABLED、
 * DEFINITION_DISABLED、MODULE_DISABLED。 {@code effectiveScope} 为此授权配置解析后的范围（继承时取角色默认）， 不是某用户的合并结果。
 */
public record PermissionHolderRoleResp(
    Long roleId,
    String roleName,
    String roleKey,
    int roleStatus,
    String roleDataScope,
    boolean enabled,
    String scopeOverride,
    String effectiveScope,
    @Schema(nullable = true) Instant validFrom,
    @Schema(nullable = true) Instant validUntil,
    String state,
    long visibleMemberCount,
    long outOfScopeMemberCount,
    List<InsightUserResp> members) {}
