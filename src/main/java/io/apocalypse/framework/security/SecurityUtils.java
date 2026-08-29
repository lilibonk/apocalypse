package io.apocalypse.framework.security;

import java.util.Optional;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;

/** 安全上下文工具：从 SecurityContextHolder 取当前登录用户身份。 */
public final class SecurityUtils {

  private SecurityUtils() {}

  /** 当前用户 ID（JWT claim {@code uid}），未登录或不包含时为空。 */
  public static Optional<Long> currentUserId() {
    return currentJwt()
        .map(jwt -> jwt.getClaim("uid"))
        .map(Number.class::cast)
        .map(Number::longValue);
  }

  /** 当前用户名（JWT subject），未登录时为空。 */
  public static Optional<String> currentUsername() {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    if (authentication == null || !authentication.isAuthenticated()) {
      return Optional.empty();
    }
    return Optional.ofNullable(authentication.getName());
  }

  private static Optional<Jwt> currentJwt() {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    if (authentication != null && authentication.getPrincipal() instanceof Jwt jwt) {
      return Optional.of(jwt);
    }
    return Optional.empty();
  }
}
