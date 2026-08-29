package io.apocalypse.framework.log;

import io.apocalypse.common.event.OperLoggedEvent;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

/**
 * 操作日志事件发布器：在独立事务（REQUIRES_NEW）中发布。 切面在业务方法返回后发布事件，此时业务事务已提交， 而 {@code @ApplicationModuleListener}
 * 要求事件在事务内发布（否则被 {@code @TransactionalEventListener} 丢弃）。
 */
@Component
@RequiredArgsConstructor
public class OperLogEventPublisher {

  private final ApplicationEventPublisher eventPublisher;

  /** 发布操作日志事件（独立事务提交）。 */
  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public void publish(OperLoggedEvent event) {
    eventPublisher.publishEvent(event);
  }
}
