package io.apocalypse.system.authorization.service;

import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.framework.capability.CapabilityRegistry;
import io.apocalypse.framework.security.SecurityUtils;
import io.apocalypse.system.authorization.dto.response.DataScopeResp;
import io.apocalypse.system.authorization.mapper.DataScopeMapper;

import java.util.List;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

/** 首版显式操作范围；管理写入在业务事务中先锁后取当前授权，防止授权与目标变化的检查/写入撕裂。 */
@Service
@RequiredArgsConstructor
public class DataScopeService {

  private final DataScopeMapper dataScopeMapper;

  private final CapabilityRegistry capabilityRegistry;

  public DataScopeResp resolve(String permission) {
    Long userId =
        SecurityUtils.currentUserId().orElseThrow(() -> new BizException(ErrorCode.FORBIDDEN));
    String username =
        SecurityUtils.currentUsername().orElseThrow(() -> new BizException(ErrorCode.FORBIDDEN));
    List<String> grants =
        dataScopeMapper.selectGrants(userId, username, permission).stream()
            .filter(grant -> capabilityRegistry.isEnabled(grant.moduleKey()))
            .map(grant -> grant.dataScope())
            .toList();
    if (grants.isEmpty()) {
      throw new BizException(ErrorCode.FORBIDDEN);
    }
    if (grants.contains("ALL")) {
      return new DataScopeResp(true, List.of());
    }
    return new DataScopeResp(
        false,
        dataScopeMapper.selectAllowedDepartments(userId, grants.contains("DEPT_AND_CHILDREN")));
  }

  public void lockForWrite() {
    dataScopeMapper.lockAuthorization();
  }

  public void requireGlobalWrite(String permission) {
    lockForWrite();
    if (!resolve(permission).all()) {
      throw new BizException(ErrorCode.FORBIDDEN.getCode(), "该操作需要由全部数据范围角色授予");
    }
  }

  public void requireWritableTarget(DataScopeResp scope, Long userId, Long departmentId) {
    if (!scope.permits(departmentId)
        || (!scope.all() && dataScopeMapper.hasEffectiveAllRole(userId))) {
      throw new BizException(ErrorCode.NOT_FOUND.getCode(), "用户不存在");
    }
  }
}
