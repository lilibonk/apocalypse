package io.apocalypse.framework.security;

import io.apocalypse.common.event.LoginFailedEvent;
import io.apocalypse.common.event.LoginSucceededEvent;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

/**
 * 登录事件发布器：在独立事务（REQUIRES_NEW）中发布。 {@code @ApplicationModuleListener} 基于
 * {@code @TransactionalEventListener}（未开 fallbackExecution）——无事务上下文发布的事件会被丢弃；
 * 且登录失败路径主流程以异常结束，事件若挂在调用方事务上会随回滚丢失，故必须独立提交。
 */
@Component
@RequiredArgsConstructor
public class LoginEventPublisher {

  private final ApplicationEventPublisher eventPublisher;

  /** 发布登录成功事件（独立事务提交）。 */
  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public void publish(LoginSucceededEvent event) {
    eventPublisher.publishEvent(event);
  }

  /** 发布登录失败事件（独立事务提交）。 */
  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public void publish(LoginFailedEvent event) {
    eventPublisher.publishEvent(event);
  }
}
