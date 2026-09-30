package io.apocalypse.framework.security;

import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

/** 浏览器协议适配；令牌消费、登录审计和持久化撤销沿用 AuthService。 */
@Service
@RequiredArgsConstructor
public class BrowserSessionService {

  private final AuthService authService;

  private final BrowserCookiePolicy cookiePolicy;

  public AuthService.TokenResponse login(
      String username, String password, HttpServletRequest request, HttpServletResponse response) {
    var tokens =
        authService
            .login(username, password, request.getRemoteAddr(), request.getHeader("User-Agent"))
            .orElseThrow(() -> new BizException(ErrorCode.SYSTEM_ERROR.getCode(), "登录能力未接入"));
    cookiePolicy.issue(request, response, tokens.refreshToken());
    return tokens;
  }

  public AuthService.TokenResponse refresh(
      HttpServletRequest request, HttpServletResponse response) {
    var tokens =
        authService.refresh(
            cookiePolicy.refreshToken(request),
            request.getRemoteAddr(),
            request.getHeader("User-Agent"));
    cookiePolicy.issue(request, response, tokens.refreshToken());
    return tokens;
  }

  public void logout(HttpServletRequest request, HttpServletResponse response) {
    authService.logoutRefresh(cookiePolicy.refreshToken(request));
    cookiePolicy.clear(request, response);
  }
}
