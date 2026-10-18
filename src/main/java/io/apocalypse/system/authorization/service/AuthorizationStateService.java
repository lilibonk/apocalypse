package io.apocalypse.system.authorization.service;

import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.exception.ConcurrencyGuard;
import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.system.authorization.mapper.AuthorizationManagementMapper;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

/** 跨 system 子域共享的并发版本入口；调用方先持有授权事务锁。 */
@Service
@RequiredArgsConstructor
public class AuthorizationStateService {
  private final AuthorizationManagementMapper mapper;

  public long roleRevision(Long roleId) {
    Long revision = mapper.roleRevision(roleId);
    if (revision == null) {
      throw new BizException(ErrorCode.NOT_FOUND.getCode(), "角色不存在");
    }
    return revision;
  }

  public long catalogRevision() {
    return mapper.catalogRevision();
  }

  public Map<Long, Long> roleRevisions(List<Long> roleIds) {
    if (roleIds.isEmpty()) {
      return Map.of();
    }
    return mapper.roleRevisions(roleIds).stream()
        .collect(Collectors.toMap(item -> item.roleId(), item -> item.revision()));
  }

  public long requireRoleRevision(Long roleId, Long expected) {
    long current = roleRevision(roleId);
    if (!Objects.equals(expected, current)) {
      throw new BizException(ErrorCode.CONFLICT);
    }
    return current;
  }

  public void requireCatalogRevision(Long expected) {
    if (!Objects.equals(expected, catalogRevision())) {
      throw new BizException(ErrorCode.CONFLICT);
    }
  }

  @Transactional(propagation = Propagation.MANDATORY)
  public void initializeRole(Long roleId) {
    ConcurrencyGuard.requireSingleRow(mapper.initializeRole(roleId));
  }

  @Transactional(propagation = Propagation.MANDATORY)
  public long advanceRole(Long roleId, long expected) {
    ConcurrencyGuard.requireSingleRow(mapper.advanceRole(roleId, expected));
    return expected + 1;
  }

  @Transactional(propagation = Propagation.MANDATORY)
  public long advanceCatalog() {
    ConcurrencyGuard.requireSingleRow(mapper.advanceCatalog());
    return catalogRevision();
  }

  @Transactional(propagation = Propagation.MANDATORY)
  public void navigationChanged(Long menuId) {
    mapper.advanceNavigationReferences(menuId);
  }
}
