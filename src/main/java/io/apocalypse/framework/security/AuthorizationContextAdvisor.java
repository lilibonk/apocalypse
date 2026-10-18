package io.apocalypse.framework.security;

import org.aopalliance.aop.Advice;
import org.aopalliance.intercept.MethodInterceptor;
import org.springframework.aop.Pointcut;
import org.springframework.aop.support.AbstractPointcutAdvisor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.Role;
import org.springframework.security.authorization.method.AuthorizationInterceptorsOrder;
import org.springframework.security.authorization.method.AuthorizationManagerBeforeMethodInterceptor;
import org.springframework.stereotype.Component;

/** 与 Spring 原生 PreAuthorize 使用完全相同的 pointcut，在表达式求值和业务调用期间绑定一次快照。 */
@Component
@Role(BeanDefinition.ROLE_INFRASTRUCTURE)
public class AuthorizationContextAdvisor extends AbstractPointcutAdvisor {
  private final Pointcut pointcut =
      AuthorizationManagerBeforeMethodInterceptor.preAuthorize().getPointcut();

  private final MethodInterceptor advice;

  public AuthorizationContextAdvisor(
      ObjectProvider<LiveAuthorizationService> authorizationService) {
    setOrder(AuthorizationInterceptorsOrder.PRE_AUTHORIZE.getOrder() - 1);
    advice =
        invocation -> {
          try (var ignored =
              AuthorizationInvocationContext.enter(
                  invocation,
                  authentication -> authorizationService.getObject().read(authentication))) {
            return invocation.proceed();
          }
        };
  }

  @Override
  public Pointcut getPointcut() {
    return pointcut;
  }

  @Override
  public Advice getAdvice() {
    return advice;
  }
}
