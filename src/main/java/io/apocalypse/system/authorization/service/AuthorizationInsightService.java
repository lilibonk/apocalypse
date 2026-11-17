package io.apocalypse.system.authorization.service;

import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.framework.capability.CapabilityRegistry;
import io.apocalypse.framework.security.PermissionActionRegistry;
import io.apocalypse.framework.security.SecurityUtils;
import io.apocalypse.system.authorization.dto.response.AuthorizationOverviewResp;
import io.apocalypse.system.authorization.dto.response.BusinessDomainSummaryResp;
import io.apocalypse.system.authorization.dto.response.DataScopeResp;
import io.apocalypse.system.authorization.dto.response.IdleRoleResp;
import io.apocalypse.system.authorization.dto.response.InsightCountResp;
import io.apocalypse.system.authorization.dto.response.InsightUserResp;
import io.apocalypse.system.authorization.dto.response.PermissionHolderRoleResp;
import io.apocalypse.system.authorization.dto.response.PermissionHoldersResp;
import io.apocalypse.system.authorization.dto.response.RoleDomainAccessResp;
import io.apocalypse.system.authorization.dto.response.RoleTopologyNodeResp;
import io.apocalypse.system.authorization.dto.response.UnassignedNavigationResp;
import io.apocalypse.system.authorization.mapper.AuthorizationInsightMapper;
import io.apocalypse.system.authorization.mapper.AuthorizationInsightMapper.GrantRow;
import io.apocalypse.system.authorization.mapper.AuthorizationInsightMapper.MemberRow;
import io.apocalypse.system.authorization.mapper.AuthorizationInsightMapper.PermissionSummaryRow;
import io.apocalypse.system.authorization.mapper.AuthorizationInsightMapper.RoleCountRow;
import io.apocalypse.system.authorization.mapper.AuthorizationInsightMapper.RoleRow;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

/**
 * 确定性授权洞察：权限全景计数与“谁能执行某权限”。同一 REPEATABLE_READ 快照与同一可信时刻计算，
 * 授予状态与实时判定使用相同条件（角色启用、定义启用、模块启用、授予启用、半开有效期）。结果是配置关系， 不推断某用户经多角色合并后的最终范围。
 */
@Service
@RequiredArgsConstructor
public class AuthorizationInsightService {

  static final int LIST_LIMIT = 50;

  static final int MEMBERS_PER_ROLE = 20;

  static final int TOPOLOGY_SAMPLE_LIMIT = 3;

  private static final List<String> CORE_DOMAIN_KEYS =
      List.of("identity_org", "rbac_nav", "runtime_config", "security_audit");

  private static final Set<String> READ_ONLY_ACTIONS =
      Set.of("list", "query", "detail", "view", "export", "overview", "holders");

  private final AuthorizationInsightMapper mapper;

  private final DataScopeService dataScopeService;

  private final CapabilityRegistry capabilities;

  private final Clock authorizationClock;

  @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
  public AuthorizationOverviewResp overview() {
    Instant now = authorizationClock.instant();
    DataScopeResp users = userScope();
    List<RoleRow> roles = mapper.roles();
    Map<Long, RoleRow> roleById = new HashMap<>();
    for (RoleRow role : roles) {
      roleById.put(role.id(), role);
    }
    Map<String, DomainTotalAcc> domainTotals = new LinkedHashMap<>();
    for (String coreDomain : CORE_DOMAIN_KEYS) {
      domainTotals.put(coreDomain, new DomainTotalAcc(coreDomain, null, true));
    }
    for (PermissionSummaryRow perm : mapper.allPermissionSummaries()) {
      String normalizedModule =
          perm.moduleKey() != null && !perm.moduleKey().isBlank() ? perm.moduleKey().trim() : null;
      String domainKey = classifyDomainKey(normalizedModule, perm.code());
      domainTotals.computeIfAbsent(
              domainKey,
              key ->
                  new DomainTotalAcc(
                      key, normalizedModule, capabilities.isEnabled(normalizedModule)))
          .totalPermissions++;
    }
    List<BusinessDomainSummaryResp> businessDomains =
        domainTotals.values().stream()
            .map(
                acc ->
                    new BusinessDomainSummaryResp(
                        acc.domainKey, acc.moduleKey, acc.moduleEnabled, acc.totalPermissions))
            .toList();

    Map<Long, Long> activeGrants = new HashMap<>();
    Map<Long, Map<String, DomainGrantAcc>> roleDomainGrants = new HashMap<>();
    for (GrantRow grant : mapper.grants()) {
      RoleRow role = roleById.get(grant.roleId());
      if (role != null && "ACTIVE".equals(state(role.status(), grant, now))) {
        activeGrants.merge(grant.roleId(), 1L, Long::sum);
        String domainKey = classifyDomainKey(grant.moduleKey(), grant.permissionCode());
        DomainGrantAcc acc =
            roleDomainGrants
                .computeIfAbsent(grant.roleId(), key -> new LinkedHashMap<>())
                .computeIfAbsent(domainKey, key -> new DomainGrantAcc());
        acc.activeGrantCount++;
        if (isWriteAction(grant.permissionCode())) {
          acc.writeGrantCount++;
        }
      }
    }

    Map<Long, List<MemberRow>> membersByRole = new HashMap<>();
    for (MemberRow member : mapper.allRoleMembers()) {
      membersByRole.computeIfAbsent(member.roleId(), key -> new ArrayList<>()).add(member);
    }
    Map<Long, Long> navCountsByRole = new HashMap<>();
    for (RoleCountRow navCount : mapper.navigationCountsByRole()) {
      navCountsByRole.put(navCount.roleId(), navCount.count());
    }

    List<IdleRoleResp> idle = new ArrayList<>();
    List<RoleTopologyNodeResp> roleTopology = new ArrayList<>();
    Map<String, Long> scopes = new LinkedHashMap<>();
    long enabledRoles = 0;
    for (RoleRow role : roles) {
      scopes.merge(role.dataScope(), 1L, Long::sum);
      if (role.status() == 1) {
        enabledRoles++;
      }
      long active = activeGrants.getOrDefault(role.id(), 0L);
      boolean noMembers = role.memberCount() == 0;
      boolean noGrants = active == 0;
      if (noMembers || noGrants) {
        idle.add(
            new IdleRoleResp(
                role.id(),
                role.roleName(),
                role.roleKey(),
                role.status(),
                role.memberCount(),
                active,
                noMembers && noGrants ? "BOTH" : noMembers ? "NO_MEMBERS" : "NO_ACTIVE_GRANTS"));
      }
      List<MemberRow> allMembers = membersByRole.getOrDefault(role.id(), List.of());
      List<MemberRow> visibleMembers =
          users == null
              ? List.of()
              : allMembers.stream().filter(m -> users.permits(m.deptId())).toList();
      List<InsightUserResp> sampleMembers =
          visibleMembers.stream()
              .limit(TOPOLOGY_SAMPLE_LIMIT)
              .map(m -> new InsightUserResp(m.userId(), m.username(), m.nickname()))
              .toList();
      Map<String, DomainGrantAcc> domainMap = roleDomainGrants.getOrDefault(role.id(), Map.of());
      List<RoleDomainAccessResp> domainAccess = new ArrayList<>();
      for (String domainKey : domainTotals.keySet()) {
        DomainGrantAcc acc = domainMap.get(domainKey);
        if (acc != null && acc.activeGrantCount > 0) {
          domainAccess.add(
              new RoleDomainAccessResp(
                  domainKey,
                  acc.activeGrantCount,
                  acc.writeGrantCount,
                  acc.writeGrantCount > 0 ? "GOVERN" : "READ"));
        }
      }
      for (Map.Entry<String, DomainGrantAcc> entry : domainMap.entrySet()) {
        if (!domainTotals.containsKey(entry.getKey()) && entry.getValue().activeGrantCount > 0) {
          DomainGrantAcc acc = entry.getValue();
          domainAccess.add(
              new RoleDomainAccessResp(
                  entry.getKey(),
                  acc.activeGrantCount,
                  acc.writeGrantCount,
                  acc.writeGrantCount > 0 ? "GOVERN" : "READ"));
        }
      }
      roleTopology.add(
          new RoleTopologyNodeResp(
              role.id(),
              role.roleName(),
              role.roleKey(),
              role.status(),
              role.dataScope(),
              role.memberCount(),
              visibleMembers.size(),
              sampleMembers,
              active,
              navCountsByRole.getOrDefault(role.id(), 0L),
              domainAccess));
    }
    List<UnassignedNavigationResp> navigation =
        mapper.unassignedNavigation().stream()
            .map(
                row ->
                    new UnassignedNavigationResp(
                        row.id(),
                        row.menuName(),
                        row.menuType(),
                        row.parentId(),
                        row.path(),
                        row.moduleKey(),
                        capabilities.isEnabled(row.moduleKey())))
            .toList();
    boolean usersVisible = users != null;
    long userCount = canQuery(users) ? mapper.scopedUserCount(users.all(), ids(users)) : 0;
    long withoutRolesCount =
        canQuery(users) ? mapper.usersWithoutRolesCount(users.all(), ids(users)) : 0;
    List<InsightUserResp> withoutRoles =
        canQuery(users)
            ? mapper.usersWithoutRoles(users.all(), ids(users), LIST_LIMIT).stream()
                .map(row -> new InsightUserResp(row.id(), row.username(), row.nickname()))
                .toList()
            : List.of();
    return new AuthorizationOverviewResp(
        now,
        usersVisible,
        userCount,
        roles.size(),
        enabledRoles,
        mapper.permissionCount(),
        mapper.navigationCount(),
        idle.size(),
        idle.stream().limit(LIST_LIMIT).toList(),
        withoutRolesCount,
        withoutRoles,
        navigation.size(),
        navigation.stream().limit(LIST_LIMIT).toList(),
        scopes.entrySet().stream()
            .map(entry -> new InsightCountResp(entry.getKey(), entry.getValue(), true))
            .toList(),
        mapper.permissionModules().stream()
            .map(
                row ->
                    new InsightCountResp(row.key(), row.count(), capabilities.isEnabled(row.key())))
            .toList(),
        businessDomains,
        roleTopology);
  }

  @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
  public PermissionHoldersResp holders(Long permissionId) {
    Instant now = authorizationClock.instant();
    var permission = mapper.permission(permissionId);
    if (permission == null) {
      throw new BizException(ErrorCode.NOT_FOUND.getCode(), "权限定义不存在");
    }
    DataScopeResp users = userScope();
    boolean outOfScopeVisible = roleEditIsGlobal();
    Map<Long, RoleRow> roles = new HashMap<>();
    for (RoleRow role : mapper.roles()) {
      roles.put(role.id(), role);
    }
    Map<Long, List<MemberRow>> members = new HashMap<>();
    for (MemberRow member : mapper.membersOfPermission(permissionId)) {
      members.computeIfAbsent(member.roleId(), key -> new ArrayList<>()).add(member);
    }
    List<PermissionHolderRoleResp> result = new ArrayList<>();
    Set<Long> covered = new HashSet<>();
    long activeRoles = 0;
    for (GrantRow grant : mapper.grantsOf(permissionId)) {
      RoleRow role = roles.get(grant.roleId());
      if (role == null) {
        continue;
      }
      String state = state(role.status(), grant, now);
      List<MemberRow> all = members.getOrDefault(role.id(), List.of());
      List<MemberRow> visible =
          users == null ? List.of() : all.stream().filter(m -> users.permits(m.deptId())).toList();
      if ("ACTIVE".equals(state)) {
        activeRoles++;
        visible.forEach(member -> covered.add(member.userId()));
      }
      result.add(
          new PermissionHolderRoleResp(
              role.id(),
              role.roleName(),
              role.roleKey(),
              role.status(),
              role.dataScope(),
              grant.enabled(),
              grant.scopeOverride(),
              PermissionActionRegistry.INHERIT_ROLE.equals(grant.scopeOverride())
                  ? role.dataScope()
                  : grant.scopeOverride(),
              grant.validFrom(),
              grant.validUntil(),
              state,
              visible.size(),
              outOfScopeVisible ? all.size() - visible.size() : 0,
              visible.stream()
                  .limit(MEMBERS_PER_ROLE)
                  .map(m -> new InsightUserResp(m.userId(), m.username(), m.nickname()))
                  .toList()));
    }
    return new PermissionHoldersResp(
        now,
        permission.id(),
        permission.code(),
        permission.name(),
        permission.moduleKey(),
        permission.status(),
        permission.lifecycle(),
        capabilities.isEnabled(permission.moduleKey()),
        users != null,
        outOfScopeVisible,
        activeRoles,
        covered.size(),
        result);
  }

  /** 与实时判定同一组条件；顺序决定展示的首要原因。 */
  String state(int roleStatus, GrantRow grant, Instant now) {
    if (roleStatus != 1) {
      return "ROLE_DISABLED";
    }
    if (grant.permissionStatus() != 1) {
      return "DEFINITION_DISABLED";
    }
    if (!capabilities.isEnabled(grant.moduleKey())) {
      return "MODULE_DISABLED";
    }
    if (!grant.enabled()) {
      return "PAUSED";
    }
    if (grant.validFrom() != null && now.isBefore(grant.validFrom())) {
      return "NOT_STARTED";
    }
    if (grant.validUntil() != null && !now.isBefore(grant.validUntil())) {
      return "EXPIRED";
    }
    return "ACTIVE";
  }

  /** 无 {@code system:user:list} 时不返回任何用户资料。 */
  private DataScopeResp userScope() {
    if (!SecurityUtils.hasAuthority("system:user:list")) {
      return null;
    }
    try {
      return dataScopeService.resolve("system:user:list");
    } catch (BizException denied) {
      return null;
    }
  }

  /** 范围外成员计数沿用完整成员基线合同：只对 role:edit 有效范围为 ALL 的调用者开放。 */
  private boolean roleEditIsGlobal() {
    if (!SecurityUtils.hasAuthority("system:role:edit")) {
      return false;
    }
    try {
      return dataScopeService.resolve("system:role:edit").all();
    } catch (BizException denied) {
      return false;
    }
  }

  static String classifyDomainKey(String moduleKey, String permissionCode) {
    if (moduleKey != null && !moduleKey.isBlank()) {
      return moduleKey.trim();
    }
    if (permissionCode == null || permissionCode.isBlank()) {
      return "security_audit";
    }
    String[] parts = permissionCode.trim().split(":");
    String resource = parts.length >= 2 ? parts[1].trim().toLowerCase(Locale.ROOT) : "";
    return switch (resource) {
      case "user", "dept" -> "identity_org";
      case "role", "permission", "menu" -> "rbac_nav";
      case "dict", "config", "online" -> "runtime_config";
      default -> "security_audit";
    };
  }

  static boolean isWriteAction(String permissionCode) {
    if (permissionCode == null || permissionCode.isBlank()) {
      return false;
    }
    String[] parts = permissionCode.trim().split(":");
    String action =
        parts.length >= 3
            ? parts[2].trim().toLowerCase(Locale.ROOT)
            : parts[parts.length - 1].trim().toLowerCase(Locale.ROOT);
    return !READ_ONLY_ACTIONS.contains(action);
  }

  private static boolean canQuery(DataScopeResp scope) {
    return scope != null && (scope.all() || !scope.departmentIds().isEmpty());
  }

  private static List<Long> ids(DataScopeResp scope) {
    return scope == null ? List.of() : scope.departmentIds();
  }

  private static final class DomainTotalAcc {

    private final String domainKey;

    private final String moduleKey;

    private final boolean moduleEnabled;

    private long totalPermissions;

    private DomainTotalAcc(String domainKey, String moduleKey, boolean moduleEnabled) {
      this.domainKey = domainKey;
      this.moduleKey = moduleKey;
      this.moduleEnabled = moduleEnabled;
    }
  }

  private static final class DomainGrantAcc {

    private long activeGrantCount;

    private long writeGrantCount;
  }
}
