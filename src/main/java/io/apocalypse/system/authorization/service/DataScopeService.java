package io.apocalypse.system.authorization.service;

import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.framework.security.AuthorizationInvocationContext;
import io.apocalypse.framework.security.AuthorizationSnapshot;
import io.apocalypse.framework.security.LiveAuthorizationService;
import io.apocalypse.framework.security.PermissionActionRegistry;
import io.apocalypse.system.authorization.dto.response.DataScopeResp;
import io.apocalypse.system.authorization.mapper.DataScopeMapper;

import java.time.Clock;
import java.time.Instant;
import java.util.Objects;

import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import lombok.RequiredArgsConstructor;

/** 首版显式操作范围；管理写入在业务事务中先锁后取当前授权，防止授权与目标变化的检查/写入撕裂。 */
@Service
@RequiredArgsConstructor
public class DataScopeService {

  private final DataScopeMapper dataScopeMapper;

  private final LiveAuthorizationService authorization;

  private final PermissionActionRegistry registry;

  private final Clock authorizationClock;

  public DataScopeResp resolve(String permission) {
    WriteAuthorization write = writeAuthorization();
    var method = AuthorizationInvocationContext.currentSnapshot();
    AuthorizationSnapshot snapshot =
        write != null
            ? method.map(write.snapshot::restrictTo).orElse(write.snapshot)
            : method.orElseGet(authorization::current);
    LiveAuthorizationService.requireMatchingIdentity(
        LiveAuthorizationService.requireUserToken(
            SecurityContextHolder.getContext().getAuthentication()),
        snapshot);
    var scope = snapshot.scopes().get(permission);
    if (!snapshot.allows(permission) || scope == null) {
      throw new BizException(ErrorCode.FORBIDDEN);
    }
    return new DataScopeResp(scope.all(), scope.departmentIds());
  }

  public void lockForWrite() {
    if (!TransactionSynchronizationManager.isActualTransactionActive()) {
      throw new IllegalStateException("授权写入必须在业务事务中执行");
    }
    var original = AuthorizationInvocationContext.currentSnapshot();
    dataScopeMapper.lockAuthorization();
    AuthorizationSnapshot current = authorization.current();
    if (original.isPresent()) {
      current = current.restrictTo(original.get());
    }
    WriteAuthorization write = writeAuthorization();
    if (write == null) {
      TransactionSynchronizationManager.registerSynchronization(new WriteAuthorization(current));
    } else {
      write.snapshot = current.restrictTo(write.snapshot);
    }
  }

  public void requireGlobalWrite(String permission) {
    lockForWrite();
    if (!resolve(permission).all()) {
      throw new BizException(ErrorCode.FORBIDDEN.getCode(), "该操作需要由全部数据范围角色授予");
    }
  }

  public void requireWritableTarget(DataScopeResp scope, Long userId, Long departmentId) {
    if (!scope.permits(departmentId) || (!scope.all() && protectedIdentity(userId))) {
      throw new BizException(ErrorCode.NOT_FOUND.getCode(), "用户不存在");
    }
  }

  private boolean protectedIdentity(Long userId) {
    if (dataScopeMapper.hasEffectiveAllRole(userId)) {
      return true;
    }
    WriteAuthorization write = writeAuthorization();
    Instant at = write == null ? authorizationClock.instant() : write.snapshot.evaluatedAt();
    return dataScopeMapper.potentialAllGrants(userId, at).stream()
        .anyMatch(
            grant ->
                registry
                    .find(grant.code())
                    .filter(action -> !action.legacy() && action.systemScope())
                    .filter(action -> Objects.equals(action.moduleKey(), grant.moduleKey()))
                    .isPresent());
  }

  private static WriteAuthorization writeAuthorization() {
    if (!TransactionSynchronizationManager.isSynchronizationActive()) {
      return null;
    }
    return TransactionSynchronizationManager.getSynchronizations().stream()
        .filter(WriteAuthorization.class::isInstance)
        .map(WriteAuthorization.class::cast)
        .findFirst()
        .orElse(null);
  }

  /** 同步器随事务结束或挂起而离开当前线程，不能被下一调用或 REQUIRES_NEW 事务复用。 */
  private static final class WriteAuthorization implements TransactionSynchronization {
    private AuthorizationSnapshot snapshot;

    private WriteAuthorization(AuthorizationSnapshot snapshot) {
      this.snapshot = snapshot;
    }
  }
}
