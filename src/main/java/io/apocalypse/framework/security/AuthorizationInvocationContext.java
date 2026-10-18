package io.apocalypse.framework.security;

import java.util.Optional;
import java.util.function.Function;

import org.aopalliance.intercept.MethodInvocation;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

/** 方法拦截器管理的显式授权上下文；非继承线程状态，退出调用必清理，缺失绝不视为允许。 */
public final class AuthorizationInvocationContext {
  private static final ThreadLocal<Frame> CURRENT = new ThreadLocal<>();

  private AuthorizationInvocationContext() {}

  static Frame enter(
      MethodInvocation invocation, Function<Authentication, AuthorizationSnapshot> loader) {
    Frame frame = new Frame(invocation, loader, CURRENT.get());
    CURRENT.set(frame);
    return frame;
  }

  static AuthorizationSnapshot snapshot(
      MethodInvocation invocation, Authentication authentication) {
    Frame frame = CURRENT.get();
    if (frame == null
        || !frame.invocation.getMethod().equals(invocation.getMethod())
        || frame.invocation.getThis() != invocation.getThis()) {
      throw new AccessDeniedException("缺少方法授权上下文");
    }
    return frame.snapshot(authentication);
  }

  public static Optional<AuthorizationSnapshot> currentSnapshot() {
    Frame frame = CURRENT.get();
    return frame == null
        ? Optional.empty()
        : Optional.of(frame.snapshot(SecurityContextHolder.getContext().getAuthentication()));
  }

  static final class Frame implements AutoCloseable {
    private final MethodInvocation invocation;

    private final Function<Authentication, AuthorizationSnapshot> loader;

    private final Frame previous;

    private AuthorizationSnapshot snapshot;

    private Frame(
        MethodInvocation invocation,
        Function<Authentication, AuthorizationSnapshot> loader,
        Frame previous) {
      this.invocation = invocation;
      this.loader = loader;
      this.previous = previous;
    }

    private AuthorizationSnapshot snapshot(Authentication authentication) {
      var jwt = LiveAuthorizationService.requireUserToken(authentication);
      if (snapshot == null) {
        snapshot = loader.apply(authentication);
      }
      LiveAuthorizationService.requireMatchingIdentity(jwt, snapshot);
      return snapshot;
    }

    @Override
    public void close() {
      if (previous == null) {
        CURRENT.remove();
      } else {
        CURRENT.set(previous);
      }
    }
  }
}
