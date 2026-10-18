package io.apocalypse.system.authorization.service;

import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.exception.ConcurrencyGuard;
import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.common.response.PageResult;
import io.apocalypse.framework.security.PermissionActionRegistry;
import io.apocalypse.framework.security.TokenVersionStore;
import io.apocalypse.system.authorization.dto.request.PermissionSaveReq;
import io.apocalypse.system.authorization.dto.response.PermissionDefinitionResp;
import io.apocalypse.system.authorization.entity.SysPermissionEntity;
import io.apocalypse.system.authorization.mapper.SysPermissionMapper;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

/** 权限定义独立于导航；可执行身份和范围只从代码声明读取。 */
@Service
@RequiredArgsConstructor
public class PermissionDefinitionService {
  private final SysPermissionMapper mapper;

  private final PermissionConvert convert;

  private final PermissionActionRegistry registry;

  private final DataScopeService dataScopeService;

  private final AuthorizationStateService state;

  private final AuthorizationAuditService audit;

  private final TokenVersionStore tokenVersionStore;

  public PageResult<PermissionDefinitionResp> page(
      int page, int size, String keyword, String moduleKey, String resource, Integer status) {
    Map<Long, Long> counts = referenceCounts();
    return mapper
        .pageDefinitions(page, size, keyword, moduleKey, resource, status)
        .map(entity -> response(entity, counts));
  }

  public PermissionDefinitionResp get(Long id) {
    return response(requireById(id), referenceCounts());
  }

  public Map<Long, PermissionDefinitionResp> definitions(List<Long> ids) {
    if (ids.isEmpty()) {
      return Map.of();
    }
    Map<Long, Long> counts = referenceCounts();
    return mapper.selectBatchIds(ids).stream()
        .map(entity -> response(entity, counts))
        .collect(Collectors.toMap(PermissionDefinitionResp::id, Function.identity()));
  }

  /** 新建或更改配置只接受当前已登记、启用、未弃用的动作。原未知关系可独立移除。 */
  public PermissionDefinitionResp requireConfigurable(Long id) {
    PermissionDefinitionResp definition = get(id);
    if (!definition.registered()
        || definition.status() != 1
        || !"ACTIVE".equals(definition.lifecycle())) {
      throw new BizException(ErrorCode.PARAM_INVALID.getCode(), "该权限定义当前不接受授权配置");
    }
    return definition;
  }

  @Transactional
  public void update(Long id, PermissionSaveReq request) {
    dataScopeService.requireGlobalWrite("system:permission:edit");
    SysPermissionEntity entity = requireById(id);
    if (!Objects.equals(entity.getVersion(), request.expectedVersion())) {
      throw new BizException(ErrorCode.CONFLICT);
    }
    var declaration = registry.find(entity.getCode()).orElse(null);
    if (declaration == null
        || declaration.legacy()
        || !Objects.equals(declaration.moduleKey(), entity.getModuleKey())
        || "LEGACY".equals(entity.getLifecycle())) {
      throw new BizException(ErrorCode.PARAM_INVALID.getCode(), "历史权限定义不可改写");
    }
    Map<Long, Long> counts = referenceCounts();
    PermissionDefinitionResp before = response(entity, counts);
    long beforeRevision = state.catalogRevision();
    entity.setName(request.name());
    entity.setDescription(request.description());
    entity.setStatus(request.status());
    entity.setLifecycle(request.lifecycle());
    ConcurrencyGuard.requireSingleRow(mapper.updateById(entity));
    long afterRevision = state.advanceCatalog();
    tokenVersionStore.invalidateGlobalAuthorization();
    audit.record("PERMISSION", id, beforeRevision, afterRevision, before, response(entity, counts));
  }

  private SysPermissionEntity requireById(Long id) {
    SysPermissionEntity entity = mapper.selectById(id);
    if (entity == null) {
      throw new BizException(ErrorCode.NOT_FOUND.getCode(), "权限定义不存在");
    }
    return entity;
  }

  private Map<Long, Long> referenceCounts() {
    return mapper.referenceCounts().stream()
        .collect(Collectors.toMap(count -> count.permissionId(), count -> count.roleCount()));
  }

  private PermissionDefinitionResp response(SysPermissionEntity entity, Map<Long, Long> counts) {
    var declaration = registry.find(entity.getCode()).orElse(null);
    boolean registered =
        declaration != null
            && !declaration.legacy()
            && Objects.equals(declaration.moduleKey(), entity.getModuleKey());
    return convert.toResp(
        entity,
        registered ? declaration.scopeOverrides() : List.of(),
        registered,
        counts.getOrDefault(entity.getId(), 0L));
  }
}
