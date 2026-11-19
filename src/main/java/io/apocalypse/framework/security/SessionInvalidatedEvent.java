package io.apocalypse.framework.security;

/**
 * 会话或全局权限失效事件：在写操作提交后通知本地 SSE 订阅中心立即断开对应长连接。
 *
 * <p>此事件仅面向本机瞬态连接回收，不通过 {@code @ApplicationModuleListener} 持久化到 Modulith 事件日志。
 */
public record SessionInvalidatedEvent(Scope scope, String username, String jti) {

  public enum Scope {
    JTI,
    USER,
    GLOBAL
  }

  public static SessionInvalidatedEvent forJti(String jti) {
    return new SessionInvalidatedEvent(Scope.JTI, null, jti);
  }

  public static SessionInvalidatedEvent forUser(String username) {
    return new SessionInvalidatedEvent(Scope.USER, username, null);
  }

  public static SessionInvalidatedEvent forGlobal() {
    return new SessionInvalidatedEvent(Scope.GLOBAL, null, null);
  }
}
