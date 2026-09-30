package io.apocalypse.framework.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;

import org.springframework.http.HttpHeaders;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.filter.OncePerRequestFilter;

/** 仅加入安全过滤器链，避免另行注册 Servlet Filter。 */
final class BrowserRequestGuardFilter extends OncePerRequestFilter {

  private final BrowserCookiePolicy cookiePolicy;

  private final RestAccessDeniedHandler deniedHandler;

  BrowserRequestGuardFilter(
      BrowserCookiePolicy cookiePolicy, RestAccessDeniedHandler deniedHandler) {
    this.cookiePolicy = cookiePolicy;
    this.deniedHandler = deniedHandler;
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    if (BrowserCookiePolicy.isBrowserRequest(request)) {
      response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
      if (BrowserCookiePolicy.requiresCsrf(request)
          && (!cookiePolicy.permitsOrigin(request) || !cookiePolicy.hasUnambiguousCsrf(request))) {
        deniedHandler.handle(request, response, new AccessDeniedException("浏览器请求来源无效"));
        return;
      }
    }
    chain.doFilter(request, response);
  }
}
