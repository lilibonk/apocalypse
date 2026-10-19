package io.apocalypse.system.authorization.dto.response;

import java.time.Instant;
import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * “谁能执行某权限”的确定性规则查询结果。只描述授权配置与计算时刻的状态，非 AI、非用户最终有效权限推断。
 *
 * <p>{@code outOfScopeVisible} 仅当调用者的 {@code system:role:edit} 有效范围为 ALL 时为真，此时才给出范围外成员计数。
 */
public record PermissionHoldersResp(
    Instant evaluatedAt,
    Long permissionId,
    String code,
    String name,
    @Schema(nullable = true) String moduleKey,
    int status,
    String lifecycle,
    boolean moduleEnabled,
    boolean membersVisible,
    boolean outOfScopeVisible,
    long activeRoleCount,
    long coveredVisibleUserCount,
    List<PermissionHolderRoleResp> roles) {}
