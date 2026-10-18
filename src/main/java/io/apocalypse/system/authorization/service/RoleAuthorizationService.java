package io.apocalypse.system.authorization.service;

import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.framework.security.SecurityUtils;
import io.apocalypse.framework.security.TokenVersionStore;
import io.apocalypse.system.authorization.dto.request.RoleNavigationSaveReq;
import io.apocalypse.system.authorization.dto.request.RolePermissionsSaveReq;
import io.apocalypse.system.authorization.dto.response.PermissionDefinitionResp;
import io.apocalypse.system.authorization.dto.response.RoleNavigationResp;
import io.apocalypse.system.authorization.dto.response.RolePermissionGrantResp;
import io.apocalypse.system.authorization.dto.response.RolePermissionsResp;
import io.apocalypse.system.authorization.mapper.AuthorizationManagementMapper;
import io.apocalypse.system.menu.service.MenuService;

import java.util.HashSet;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

/** 角色授权与导航使用同一 revision，增量命令保留未触碰的历史配置。 */
@Service
@RequiredArgsConstructor
public class RoleAuthorizationService {
  private final AuthorizationManagementMapper mapper;

  private final AuthorizationStateService state;

  private final PermissionDefinitionService definitions;

  private final DataScopeService dataScopeService;

  private final MenuService menuService;

  private final TokenVersionStore tokenVersionStore;

  private final AuthorizationAuditService audit;

  @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
  public RolePermissionsResp permissions(Long roleId) {
    long revision = state.roleRevision(roleId);
    long catalogRevision = state.catalogRevision();
    var grants = mapper.grants(roleId);
    Map<Long, PermissionDefinitionResp> visible =
        SecurityUtils.hasAuthority("system:permission:list")
            ? definitions.definitions(grants.stream().map(grant -> grant.permissionId()).toList())
            : Map.of();
    return new RolePermissionsResp(
        roleId,
        revision,
        catalogRevision,
        grants.stream()
            .map(
                grant ->
                    new RolePermissionGrantResp(
                        grant.permissionId(),
                        grant.enabled(),
                        grant.scopeOverride(),
                        grant.validFrom(),
                        grant.validUntil(),
                        visible.get(grant.permissionId())))
            .toList());
  }

  @Transactional
  public void savePermissions(Long roleId, RolePermissionsSaveReq request) {
    dataScopeService.requireGlobalWrite("system:role:edit");
    long beforeRevision = state.requireRoleRevision(roleId, request.expectedRevision());
    state.requireCatalogRevision(request.expectedCatalogRevision());
    List<Long> upsertIds = request.upsert().stream().map(grant -> grant.permissionId()).toList();
    validateCommands(upsertIds, request.remove());
    Map<Long, PermissionDefinitionResp> changedDefinitions = definitions.definitions(upsertIds);
    for (var grant : request.upsert()) {
      PermissionDefinitionResp definition = changedDefinitions.get(grant.permissionId());
      if (definition == null) {
        throw new BizException(ErrorCode.NOT_FOUND.getCode(), "权限定义不存在");
      }
      if (!definition.registered()
          || definition.status() != 1
          || !"ACTIVE".equals(definition.lifecycle())) {
        throw new BizException(ErrorCode.PARAM_INVALID.getCode(), "该权限定义当前不接受授权配置");
      }
      if (!definition.supportedScopeOverrides().contains(grant.scopeOverride())) {
        throw new BizException(ErrorCode.PARAM_INVALID.getCode(), "该权限不支持所选数据范围");
      }
      if (grant.validFrom() != null
          && grant.validUntil() != null
          && !grant.validFrom().isBefore(grant.validUntil())) {
        throw new BizException(ErrorCode.PARAM_INVALID.getCode(), "授权有效期的开始必须早于结束");
      }
    }
    if (request.upsert().isEmpty() && request.remove().isEmpty()) {
      return;
    }
    var before = mapper.grants(roleId);
    request.remove().forEach(id -> mapper.removeGrant(roleId, id));
    request.upsert().forEach(grant -> mapper.upsertGrant(roleId, grant));
    long afterRevision = state.advanceRole(roleId, beforeRevision);
    tokenVersionStore.invalidateGlobalAuthorization();
    audit.record(
        "ROLE_PERMISSION", roleId, beforeRevision, afterRevision, before, mapper.grants(roleId));
  }

  @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
  public RoleNavigationResp navigation(Long roleId) {
    return new RoleNavigationResp(roleId, state.roleRevision(roleId), mapper.navigationIds(roleId));
  }

  @Transactional
  public void saveNavigation(Long roleId, RoleNavigationSaveReq request) {
    dataScopeService.requireGlobalWrite("system:role:edit");
    long beforeRevision = state.requireRoleRevision(roleId, request.expectedRevision());
    validateCommands(request.addIds(), request.removeIds());
    menuService.requireValidNavigationIds(request.addIds());
    if (request.addIds().isEmpty() && request.removeIds().isEmpty()) {
      return;
    }
    var before = mapper.navigationIds(roleId);
    request.removeIds().forEach(id -> mapper.removeNavigation(roleId, id));
    request.addIds().forEach(id -> mapper.addNavigation(roleId, id));
    long afterRevision = state.advanceRole(roleId, beforeRevision);
    tokenVersionStore.invalidateGlobalAuthorization();
    audit.record(
        "ROLE_NAVIGATION",
        roleId,
        beforeRevision,
        afterRevision,
        before,
        mapper.navigationIds(roleId));
  }

  private static void validateCommands(List<Long> added, List<Long> removed) {
    var additions = new HashSet<>(added);
    var removals = new HashSet<>(removed);
    if (additions.contains(null)
        || removals.contains(null)
        || additions.size() != added.size()
        || removals.size() != removed.size()
        || additions.stream().anyMatch(removals::contains)) {
      throw new BizException(ErrorCode.PARAM_INVALID.getCode(), "关联变更存在重复或互相冲突的主键");
    }
  }
}
