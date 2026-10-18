package io.apocalypse.framework.security;

import java.time.Clock;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.dao.DataAccessException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

/** 每个授权点重新核验用户身份及撤销版本；不把 JWT 的 permissions 当作业务权限上界。 */
@Component
@RequiredArgsConstructor
public class LiveAuthorizationService {
  private final ObjectProvider<UserAuthorizationQuery> query;

  private final Clock authorizationClock;

  public AuthorizationSnapshot current() {
    return read(SecurityContextHolder.getContext().getAuthentication());
  }

  public AuthorizationSnapshot read(Authentication authentication) {
    Jwt jwt = requireUserToken(authentication);
    Object userId = jwt.getClaim("uid");
    UserAuthorizationQuery provider = query.getIfAvailable();
    if (provider == null) {
      throw new AccessDeniedException("授权查询不可用");
    }
    AuthorizationSnapshot snapshot;
    try {
      snapshot =
          provider.read(
              ((Number) userId).longValue(), jwt.getSubject(), authorizationClock.instant());
    } catch (DataAccessException e) {
      throw new AccessDeniedException("授权状态暂不可用", e);
    }
    requireMatchingIdentity(jwt, snapshot);
    return snapshot;
  }

  public static Jwt requireUserToken(Authentication authentication) {
    if (authentication == null
        || !authentication.isAuthenticated()
        || !(authentication.getPrincipal() instanceof Jwt jwt)
        || !"access".equals(jwt.getClaimAsString("type"))
        || !(jwt.getClaim("uid") instanceof Number)
        || jwt.getSubject() == null) {
      throw new BadCredentialsException("凭证已失效");
    }
    return jwt;
  }

  public static void requireMatchingIdentity(Jwt jwt, AuthorizationSnapshot snapshot) {
    if (snapshot == null
        || !snapshot.userId().equals(((Number) jwt.getClaim("uid")).longValue())
        || !snapshot.username().equals(jwt.getSubject())
        || numberClaim(jwt, "av") != snapshot.versions().globalAuthorization()
        || numberClaim(jwt, "uv") != snapshot.versions().userAuthorization()
        || numberClaim(jwt, "cv") != snapshot.versions().credential()) {
      throw new BadCredentialsException("凭证已失效");
    }
  }

  private static long numberClaim(Jwt jwt, String name) {
    Object value = jwt.getClaim(name);
    return value instanceof Number number ? number.longValue() : -1L;
  }
}
