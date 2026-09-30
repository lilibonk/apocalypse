package io.apocalypse.framework.security;

import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.net.URI;
import java.time.Duration;
import java.util.Collections;
import java.util.Set;

import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/** 浏览器 Cookie 属性和精确来源约束；不将 Cookie 用作业务 API 鉴权。 */
@Component
public final class BrowserCookiePolicy {

  private static final Set<String> SAFE_METHODS = Set.of("GET", "HEAD", "OPTIONS", "TRACE");

  private final boolean secure;

  private final Set<String> allowedOrigins;

  private final String refreshCookieName;

  private final Duration refreshLifetime;

  private final CookieCsrfTokenRepository csrfRepository;

  public BrowserCookiePolicy(SecurityProperties properties, Environment environment) {
    secure = properties.getBrowser().isSecureCookie();
    boolean production = environment.acceptsProfiles(Profiles.of("prod"));
    if (production && !secure) {
      throw new IllegalStateException("prod 浏览器会话必须使用 Secure cookie");
    }
    if (!secure && !environment.acceptsProfiles(Profiles.of("dev", "test"))) {
      throw new IllegalStateException("非 Secure 浏览器 Cookie 仅允许明确 dev/test profile");
    }
    allowedOrigins = Set.copyOf(properties.getBrowser().getAllowedOrigins());
    if (production && allowedOrigins.isEmpty()) {
      throw new IllegalStateException("prod 必须显式配置浏览器 PUBLIC_ORIGIN");
    }
    for (String origin : allowedOrigins) {
      URI uri;
      try {
        uri = URI.create(origin);
      } catch (IllegalArgumentException e) {
        throw new IllegalStateException("浏览器 Origin 配置格式无效");
      }
      if (!("http".equals(uri.getScheme()) || "https".equals(uri.getScheme()))
          || uri.getHost() == null
          || uri.getUserInfo() != null
          || uri.getRawQuery() != null
          || uri.getRawFragment() != null
          || !origin.equals(uri.getScheme() + "://" + uri.getRawAuthority())
          || (production && !"https".equals(uri.getScheme()))) {
        throw new IllegalStateException("浏览器 Origin 必须是精确来源，prod 仅允许 HTTPS");
      }
    }
    refreshCookieName = secure ? "__Host-apocalypse-refresh" : "apocalypse-refresh";
    refreshLifetime = Duration.ofDays(properties.getJwt().getRefreshTtlDays());
    csrfRepository = CookieCsrfTokenRepository.withHttpOnlyFalse();
    csrfRepository.setCookiePath("/");
    csrfRepository.setCookieCustomizer(builder -> builder.secure(secure).sameSite("Strict"));
  }

  CookieCsrfTokenRepository csrfRepository() {
    return csrfRepository;
  }

  static boolean isBrowserRequest(HttpServletRequest request) {
    String path = request.getRequestURI().substring(request.getContextPath().length());
    return path.startsWith("/auth/browser/");
  }

  static boolean requiresCsrf(HttpServletRequest request) {
    return isBrowserRequest(request) && !SAFE_METHODS.contains(request.getMethod());
  }

  boolean permitsOrigin(HttpServletRequest request) {
    var origins = Collections.list(request.getHeaders(HttpHeaders.ORIGIN));
    return origins.size() == 1
        && allowedOrigins.contains(origins.getFirst())
        && !"cross-site".equals(request.getHeader("Sec-Fetch-Site"));
  }

  boolean hasUnambiguousCsrf(HttpServletRequest request) {
    var headers = Collections.list(request.getHeaders("X-XSRF-TOKEN"));
    if (headers.size() != 1 || !StringUtils.hasText(headers.getFirst())) {
      return false;
    }
    int count = 0;
    String value = null;
    if (request.getCookies() != null) {
      for (Cookie cookie : request.getCookies()) {
        if ("XSRF-TOKEN".equals(cookie.getName())) {
          count++;
          value = cookie.getValue();
        }
      }
    }
    return count == 1 && StringUtils.hasText(value);
  }

  String refreshToken(HttpServletRequest request) {
    String value = null;
    int count = 0;
    if (request.getCookies() != null) {
      for (Cookie cookie : request.getCookies()) {
        if (refreshCookieName.equals(cookie.getName())) {
          count++;
          value = cookie.getValue();
        }
      }
    }
    if (count != 1 || !StringUtils.hasText(value)) {
      throw new BizException(ErrorCode.UNAUTHORIZED.getCode(), "凭证已失效");
    }
    return value;
  }

  void issue(HttpServletRequest request, HttpServletResponse response, String refreshToken) {
    response.addHeader(HttpHeaders.SET_COOKIE, refreshCookie(refreshToken, refreshLifetime));
    csrfRepository.saveToken(csrfRepository.generateToken(request), request, response);
  }

  void clear(HttpServletRequest request, HttpServletResponse response) {
    response.addHeader(HttpHeaders.SET_COOKIE, refreshCookie("", Duration.ZERO));
    csrfRepository.saveToken(null, request, response);
  }

  private String refreshCookie(String value, Duration maxAge) {
    return ResponseCookie.from(refreshCookieName, value)
        .httpOnly(true)
        .secure(secure)
        .sameSite("Strict")
        .path("/")
        .maxAge(maxAge)
        .build()
        .toString();
  }
}
