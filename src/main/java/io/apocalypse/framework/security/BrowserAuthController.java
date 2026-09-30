package io.apocalypse.framework.security;

import io.apocalypse.common.response.R;
import io.apocalypse.framework.ratelimit.RateLimit;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;

/** 同源浏览器专用端点；响应仅包含内存 access，refresh 仅通过 HttpOnly Cookie 传输。 */
@RestController
@RequestMapping("/auth/browser")
@RequiredArgsConstructor
public class BrowserAuthController {

  private final BrowserSessionService browserSessionService;

  public record CsrfView(String token) {}

  public record AccessTokenView(String accessToken, String tokenType, long expiresIn) {}

  @GetMapping("/csrf")
  public CsrfView csrf(CsrfToken csrfToken) {
    return new CsrfView(csrfToken.getToken());
  }

  @PostMapping("/login")
  @RateLimit(limit = 20, windowSeconds = 60, key = "login")
  public AccessTokenView login(
      @Validated @RequestBody AuthController.LoginRequest login,
      HttpServletRequest request,
      HttpServletResponse response) {
    return accessView(
        browserSessionService.login(login.username(), login.password(), request, response));
  }

  @PostMapping("/refresh")
  @RateLimit(limit = 30, windowSeconds = 60, key = "refresh")
  public AccessTokenView refresh(HttpServletRequest request, HttpServletResponse response) {
    return accessView(browserSessionService.refresh(request, response));
  }

  @PostMapping("/logout")
  public R<Void> logout(HttpServletRequest request, HttpServletResponse response) {
    browserSessionService.logout(request, response);
    // ServletResponse 参数使 void 返回被 MVC 视为已处理，显式成功体保留统一空数据响应。
    return R.ok();
  }

  private static AccessTokenView accessView(AuthService.TokenResponse tokens) {
    return new AccessTokenView(tokens.accessToken(), tokens.tokenType(), tokens.expiresIn());
  }
}
