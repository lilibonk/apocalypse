package io.apocalypse.framework.security;

import jakarta.servlet.http.HttpServletRequest;

import java.time.Clock;
import java.time.Instant;
import java.util.Objects;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.dao.DataAccessException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import lombok.RequiredArgsConstructor;

/**
 * 每个授权点重新核验用户身份及撤销版本；不把 JWT 的 permissions 当作业务权限上界。
 *
 * <p>同一 HTTP 请求在过滤器阶段完成的首个快照可在非事务的控制器入口授权点单次复用， 消除每请求重复查询 {@code security_token_version} 与授权视图的双倍
 * SQL 开销；进入写事务锁（{@code lockForWrite}） 或时钟推进后一律强制重新回源数据库。
 */
@Component
@RequiredArgsConstructor
public class LiveAuthorizationService {

  private static final String REQUEST_SNAPSHOT_ATTR =
      LiveAuthorizationService.class.getName() + ".REQUEST_SNAPSHOT";

  private final ObjectProvider<UserAuthorizationQuery> query;

  private final Clock authorizationClock;

  private record RequestCachedSnapshot(
      String tokenId, Instant evaluatedAt, AuthorizationSnapshot snapshot) {}

  public boolean isQueryAvailable() {
    return query.getIfAvailable() != null;
  }

  /**
   * 过滤器阶段预加载并核验当前请求的首个实时授权快照；同一请求随后进入首个非事务 {@code @PreAuthorize} 时直接消费该快照，避免重复执行 {@code
   * AuthorizationReadMapper.snapshot}。
   */
  public void preloadRequestSnapshot(HttpServletRequest request, Authentication authentication) {
    Jwt jwt = requireUserToken(authentication);
    Instant now = authorizationClock.instant();
    AuthorizationSnapshot snapshot = readFromProvider(jwt, now);
    requireMatchingIdentity(jwt, snapshot);
    if (request != null) {
      request.setAttribute(
          REQUEST_SNAPSHOT_ATTR, new RequestCachedSnapshot(jwt.getId(), now, snapshot));
    }
  }

  public AuthorizationSnapshot current() {
    return read(SecurityContextHolder.getContext().getAuthentication());
  }

  public AuthorizationSnapshot read(Authentication authentication) {
    Jwt jwt = requireUserToken(authentication);
    Instant now = authorizationClock.instant();
    if (!TransactionSynchronizationManager.isActualTransactionActive()
        && RequestContextHolder.getRequestAttributes()
            instanceof ServletRequestAttributes attributes) {
      HttpServletRequest request = attributes.getRequest();
      Object attr = request.getAttribute(REQUEST_SNAPSHOT_ATTR);
      if (attr instanceof RequestCachedSnapshot cached) {
        request.removeAttribute(REQUEST_SNAPSHOT_ATTR);
        if (Objects.equals(cached.tokenId(), jwt.getId())
            && Objects.equals(cached.evaluatedAt(), now)) {
          requireMatchingIdentity(jwt, cached.snapshot());
          return cached.snapshot();
        }
      }
    }
    AuthorizationSnapshot snapshot = readFromProvider(jwt, now);
    requireMatchingIdentity(jwt, snapshot);
    return snapshot;
  }

  private AuthorizationSnapshot readFromProvider(Jwt jwt, Instant evaluatedAt) {
    Object userId = jwt.getClaim("uid");
    UserAuthorizationQuery provider = query.getIfAvailable();
    if (provider == null) {
      throw new AccessDeniedException("授权查询不可用");
    }
    try {
      return provider.read(((Number) userId).longValue(), jwt.getSubject(), evaluatedAt);
    } catch (DataAccessException e) {
      throw new AccessDeniedException("授权状态暂不可用", e);
    }
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
