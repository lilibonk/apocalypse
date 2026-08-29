package io.apocalypse.framework.security;

import io.apocalypse.common.response.R;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import lombok.RequiredArgsConstructor;
import tools.jackson.databind.ObjectMapper;

/**
 * JWT 黑名单过滤器（强退生效点）：已认证请求的 jti 若命中黑名单，直接回 HTTP 200 + {@link R}(40100,"凭证已失效")。 注册在
 * BearerTokenAuthenticationFilter 之后（此时 SecurityContext 已填充 Jwt）。
 *
 * <p>同时拦截 refresh token 冒充访问令牌：claim {@code type=refresh} 的令牌只允许走 {@code /auth/refresh}（白名单内不经过认证，
 * 到不了本过滤器），落到受保护端点即视为无效凭证。
 *
 * <p>开销说明：每请求一次 Redis EXISTS（O(1) 单命令），管理台流量下可接受；如需进一步优化可加本地短 TTL 缓存兜底。
 */
@Component
@RequiredArgsConstructor
public class JwtBlacklistFilter extends OncePerRequestFilter {

  private final OnlineUserRegistry onlineUserRegistry;

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
      if (refreshToken || blacklisted) {
        response.setStatus(HttpServletResponse.SC_OK);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write(objectMapper.writeValueAsString(R.fail(40100, "凭证已失效")));
        return;
      }
    }
    filterChain.doFilter(request, response);
  }
}
