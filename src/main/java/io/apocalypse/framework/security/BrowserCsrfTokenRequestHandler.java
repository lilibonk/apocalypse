package io.apocalypse.framework.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.util.function.Supplier;

import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.csrf.CsrfTokenRequestHandler;
import org.springframework.security.web.csrf.XorCsrfTokenRequestAttributeHandler;
import org.springframework.util.StringUtils;

/** 复用 Spring SPA 的 header/BREACH 处理，仅浏览器路径加载 Cookie token。 */
final class BrowserCsrfTokenRequestHandler implements CsrfTokenRequestHandler {

  private final CsrfTokenRequestAttributeHandler plain = new CsrfTokenRequestAttributeHandler();

  private final CsrfTokenRequestAttributeHandler xor = new XorCsrfTokenRequestAttributeHandler();

  @Override
  public void handle(
      HttpServletRequest request, HttpServletResponse response, Supplier<CsrfToken> csrfToken) {
    if (BrowserCookiePolicy.isBrowserRequest(request)) {
      xor.handle(request, response, csrfToken);
      csrfToken.get();
    }
  }

  @Override
  public String resolveCsrfTokenValue(HttpServletRequest request, CsrfToken csrfToken) {
    var handler = StringUtils.hasText(request.getHeader(csrfToken.getHeaderName())) ? plain : xor;
    return handler.resolveCsrfTokenValue(request, csrfToken);
  }
}
