package io.apocalypse.framework.security;

import io.apocalypse.common.response.R;
import io.apocalypse.framework.web.HttpBusinessMetrics;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import lombok.RequiredArgsConstructor;
import tools.jackson.databind.ObjectMapper;

/**
 * JWT 黑名单与版本核验过滤器（强退/撤销生效点）：已认证请求的 jti 若命中黑名单或版本失配，直接回 HTTP 200 + {@link R}(40100,"凭证已失效")。注册在
 * BearerTokenAuthenticationFilter 之后（此时 SecurityContext 已填充 Jwt）。
 *
 * <p>同时拦截 refresh token 冒充访问令牌：claim {@code type=refresh} 的令牌只允许走 {@code /auth/refresh}（白名单内不经过认证，
 * 到不了本过滤器），落到受保护端点即视为无效凭证。
 *
 * <p>当 {@link LiveAuthorizationService} 可用时，本过滤器一次性完成实时授权快照读取与 {@code av/uv/cv} 核验，并将快照挂载到当前 {@link
 * HttpServletRequest} 供紧随其后的 {@code @PreAuthorize} 守卫单次消费，消除同一请求内重复查询 PostgreSQL。
 */
@Component
@RequiredArgsConstructor
public class JwtBlacklistFilter extends OncePerRequestFilter {

  private final OnlineUserRegistry onlineUserRegistry;

  private final TokenVersionStore tokenVersionStore;

  private final ObjectProvider<LiveAuthorizationService> liveAuthorizationService;

  private final ObjectMapper objectMapper;

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
      throws ServletException, IOException {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    if (authentication != null && authentication.getPrincipal() instanceof Jwt jwt) {
      String jti = jwt.getId();
      boolean refreshToken = "refresh".equals(jwt.getClaimAsString("type"));
      boolean blacklisted = StringUtils.hasText(jti) && onlineUserRegistry.isBlacklisted(jti);
      boolean staleUserToken =
          !refreshToken
              && !blacklisted
              && "access".equals(jwt.getClaimAsString("type"))
              && staleUserToken(request, authentication, jwt);
      if (refreshToken || blacklisted || staleUserToken) {
        response.setStatus(HttpServletResponse.SC_OK);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        HttpBusinessMetrics.recordCode(request, 40100);
        response.getWriter().write(objectMapper.writeValueAsString(R.fail(40100, "凭证已失效")));
        return;
      }
    }
    filterChain.doFilter(request, response);
  }

  private boolean staleUserToken(
      HttpServletRequest request, Authentication authentication, Jwt jwt) {
    Object userId = jwt.getClaim("uid");
    if (!(userId instanceof Number)) {
      return true;
    }
    LiveAuthorizationService authorizationService = liveAuthorizationService.getIfAvailable();
    if (authorizationService != null && authorizationService.isQueryAvailable()) {
      try {
        authorizationService.preloadRequestSnapshot(request, authentication);
        return false;
      } catch (BadCredentialsException e) {
        return true;
      } catch (AccessDeniedException ignored) {
        // 数据库瞬时故障交由后续授权点统一按 AccessDenied 处理，不在过滤器误报 40100。
        return false;
      }
    }
    TokenVersionStore.VersionSnapshot current = tokenVersionStore.current(jwt.getSubject());
    return claimAsLong(jwt, "av") != current.globalAuthorization()
        || claimAsLong(jwt, "uv") != current.userAuthorization()
        || claimAsLong(jwt, "cv") != current.credential();
  }

  private static long claimAsLong(Jwt jwt, String name) {
    Object value = jwt.getClaim(name);
    return value instanceof Number number ? number.longValue() : -1L;
  }
}
