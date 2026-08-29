package io.apocalypse.framework.security;

import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.common.response.R;
import io.apocalypse.framework.ratelimit.RateLimit;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.constraints.NotBlank;

import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;

/** 认证端点。 {@code /auth/**} 在 {@link SecurityConfig} 白名单中，无需令牌即可访问。 */
@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
public class AuthController {

  private final AuthService authService;

  /** 账密登录请求。 */
  public record LoginRequest(
      @NotBlank(message = "用户名不能为空") String username,
      @NotBlank(message = "密码不能为空") String password) {}

  /**
   * 账密登录，签发 JWT。system 模块未接入登录能力时返回明确提示而非 500。 限流 key=login（默认 20 次/分钟/IP， 可被 {@code
   * apocalypse.ratelimit.limits.login} 覆盖）；IP/UA 用于登录日志与在线注册。
   */
  @PostMapping("/login")
  @RateLimit(limit = 20, windowSeconds = 60, key = "login")
  public R<AuthService.TokenResponse> login(
      @Validated @RequestBody LoginRequest request, HttpServletRequest httpRequest) {
    return authService
        .login(
            request.username(),
            request.password(),
            httpRequest.getRemoteAddr(),
            httpRequest.getHeader("User-Agent"))
        .map(R::ok)
        .orElseGet(() -> R.fail(ErrorCode.SYSTEM_ERROR.getCode(), "登录能力未接入"));
  }

  /** client_credentials 风格服务账号令牌（2 期外部 Agent 使用）。 */
  @PostMapping("/token")
  public R<AuthService.TokenResponse> token(
      @RequestParam("client_id") String clientId,
      @RequestParam("client_secret") String clientSecret) {
    return R.ok(authService.issueClientToken(clientId, clientSecret));
  }

  /** 刷新请求。 */
  public record RefreshRequest(@NotBlank(message = "刷新令牌不能为空") String refreshToken) {}

  /**
   * refresh 旋转换新：旧 refresh token 作废（jti 进黑名单），签发新令牌对。 限流 key=refresh（默认 30 次/分钟/IP， 可被 {@code
   * apocalypse.ratelimit.limits.refresh} 覆盖）。
   */
  @PostMapping("/refresh")
  @RateLimit(limit = 30, windowSeconds = 60, key = "refresh")
  public R<AuthService.TokenResponse> refresh(
      @Validated @RequestBody RefreshRequest request, HttpServletRequest httpRequest) {
    return R.ok(
        authService.refresh(
            request.refreshToken(),
            httpRequest.getRemoteAddr(),
            httpRequest.getHeader("User-Agent")));
  }
}
