package io.apocalypse.system.authorization.dto.response;

import java.time.Instant;
import java.util.List;

/**
 * 权限全景：基于授权配置在 {@code evaluatedAt}（服务器可信时刻）计算，不代表某用户经多角色合并后的最终有效权限。
 *
 * <p>用户相关计数与名单受调用者 {@code system:user:list} 数据范围约束；无该权限时 {@code usersVisible=false} 且不返回用户。 名单最多返回
 * 50 项，计数为全量。
 */
public record AuthorizationOverviewResp(
    Instant evaluatedAt,
    boolean usersVisible,
    long userCount,
    long roleCount,
    long enabledRoleCount,
    long permissionCount,
    long navigationCount,
    long idleRoleCount,
    List<IdleRoleResp> idleRoles,
    long usersWithoutRolesCount,
    List<InsightUserResp> usersWithoutRoles,
    long unassignedNavigationCount,
    List<UnassignedNavigationResp> unassignedNavigation,
    List<InsightCountResp> roleScopeDistribution,
    List<InsightCountResp> permissionModules) {}
