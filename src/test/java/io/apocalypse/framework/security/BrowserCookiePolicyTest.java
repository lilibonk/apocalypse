package io.apocalypse.framework.security;

import io.apocalypse.common.exception.BizException;

import jakarta.servlet.http.Cookie;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 浏览器凭据配置的发行约束；危险生产配置必须在启动时拒绝，dev/test 才允许本地 HTTP。 */
class BrowserCookiePolicyTest {
  @Test
  void productionRequiresSecureCookiesExplicitOriginsAndHttps() {
    assertThatThrownBy(() -> policy("prod", false, List.of("https://app.example.test")))
        .isInstanceOf(IllegalStateException.class);
    assertThatThrownBy(() -> policy("prod", true, List.of()))
        .isInstanceOf(IllegalStateException.class);
    assertThatThrownBy(() -> policy("prod", true, List.of("http://app.example.test")))
        .isInstanceOf(IllegalStateException.class);
    assertThatThrownBy(() -> policy("staging", false, List.of("http://localhost:5173")))
        .isInstanceOf(IllegalStateException.class);
    assertThatThrownBy(() -> policy(null, false, List.of("http://localhost:5173")))
        .isInstanceOf(IllegalStateException.class);
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "null",
        "*",
        "https://*.example.test",
        "//app.example.test",
        "file:///tmp/app",
        "https://app.example.test/",
        "https://app.example.test/path",
        "https://name:password@app.example.test",
        "https://app.example.test?query=1",
        "https://app.example.test#fragment",
        "not an origin"
      })
  void malformedOrNonOriginConfigurationFailsBeforeRequests(String origin) {
    assertThatThrownBy(() -> policy("prod", true, List.of(origin)))
        .isInstanceOf(IllegalStateException.class);
  }

  @Test
  void
      productionIssuesHostOnlySecureHttpOnlyRefreshAndReadableStrictCsrfThenDeletesWithSameAttributes() {
    BrowserCookiePolicy policy = policy("prod", true, List.of("https://app.example.test"));
    MockHttpServletRequest request = new MockHttpServletRequest();
    MockHttpServletResponse response = new MockHttpServletResponse();
    policy.issue(request, response, "refresh-fixture");
    String refreshAttributes = attributes(response, "__Host-apocalypse-refresh");
    assertThat(refreshAttributes)
        .contains("Path=/", "Max-Age=604800", "Secure", "HttpOnly", "SameSite=Strict")
        .doesNotContain("Domain=");
    String csrfAttributes = attributes(response, "XSRF-TOKEN");
    assertThat(csrfAttributes)
        .contains("Path=/", "Secure", "SameSite=Strict")
        .doesNotContain("HttpOnly", "Domain=");
    MockHttpServletResponse cleared = new MockHttpServletResponse();
    policy.clear(request, cleared);
    assertThat(attributes(cleared, "__Host-apocalypse-refresh"))
        .contains("Path=/", "Max-Age=0", "Secure", "HttpOnly", "SameSite=Strict")
        .doesNotContain("Domain=");
    assertThat(attributes(cleared, "XSRF-TOKEN"))
        .contains("Path=/", "Max-Age=0", "Secure", "SameSite=Strict")
        .doesNotContain("HttpOnly", "Domain=");
  }

  @ParameterizedTest
  @ValueSource(strings = {"dev", "test"})
  void explicitlyLocalProfilesCanUseHttpWithoutHostPrefix(String profile) {
    BrowserCookiePolicy policy = policy(profile, false, List.of("http://localhost:5173"));
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.addHeader(HttpHeaders.ORIGIN, "http://localhost:5173");
    assertThat(policy.permitsOrigin(request)).isTrue();
    MockHttpServletResponse response = new MockHttpServletResponse();
    policy.issue(request, response, "refresh-fixture");
    assertThat(attributes(response, "apocalypse-refresh"))
        .contains("HttpOnly", "SameSite=Strict", "Path=/")
        .doesNotContain("Secure", "Domain=");
    assertThat(
            response.getHeaders(HttpHeaders.SET_COOKIE).stream()
                .anyMatch(header -> header.startsWith("__Host-")))
        .isFalse();
  }

  @Test
  void absentBlankOrDuplicateRefreshCookieFailsClosed() {
    BrowserCookiePolicy policy = policy("prod", true, List.of("https://app.example.test"));
    for (Cookie[] cookies :
        List.of(
            new Cookie[0],
            new Cookie[] {new Cookie("__Host-apocalypse-refresh", "")},
            new Cookie[] {
              new Cookie("__Host-apocalypse-refresh", "first-fixture"),
              new Cookie("__Host-apocalypse-refresh", "second-fixture")
            })) {
      MockHttpServletRequest request = new MockHttpServletRequest();
      request.setCookies(cookies);
      assertThatThrownBy(() -> policy.refreshToken(request))
          .isInstanceOfSatisfying(
              BizException.class, exception -> assertThat(exception.getCode()).isEqualTo(40100));
    }
  }

  @Test
  void duplicateOriginOrCsrfValuesAreNotSilentlyChosen() {
    BrowserCookiePolicy policy = policy("prod", true, List.of("https://app.example.test"));
    MockHttpServletRequest duplicateOrigin = new MockHttpServletRequest();
    duplicateOrigin.addHeader(HttpHeaders.ORIGIN, "https://app.example.test");
    duplicateOrigin.addHeader(HttpHeaders.ORIGIN, "https://app.example.test");
    assertThat(policy.permitsOrigin(duplicateOrigin)).isFalse();
    MockHttpServletRequest duplicateCsrf = new MockHttpServletRequest();
    duplicateCsrf.addHeader("X-XSRF-TOKEN", "first-fixture");
    duplicateCsrf.addHeader("X-XSRF-TOKEN", "second-fixture");
    assertThat(policy.hasUnambiguousCsrf(duplicateCsrf)).isFalse();
    duplicateCsrf = new MockHttpServletRequest();
    duplicateCsrf.setCookies(
        new Cookie("XSRF-TOKEN", "first-fixture"), new Cookie("XSRF-TOKEN", "second-fixture"));
    assertThat(policy.hasUnambiguousCsrf(duplicateCsrf)).isFalse();
  }

  private static BrowserCookiePolicy policy(String profile, boolean secure, List<String> origins) {
    SecurityProperties properties = new SecurityProperties();
    properties.getBrowser().setSecureCookie(secure);
    properties.getBrowser().setAllowedOrigins(origins);
    MockEnvironment environment = new MockEnvironment();
    if (profile != null) {
      environment.setActiveProfiles(profile);
    }
    return new BrowserCookiePolicy(properties, environment);
  }

  private static String attributes(MockHttpServletResponse response, String name) {
    List<String> headers =
        response.getHeaders(HttpHeaders.SET_COOKIE).stream()
            .filter(value -> value.startsWith(name + "="))
            .toList();
    assertThat(headers.size()).as("Cookie count for %s", name).isEqualTo(1);
    String attributes = headers.getFirst().substring(headers.getFirst().indexOf(';'));
    // MockHttpServletResponse does not serialize arbitrary Servlet Cookie attributes.
    // The actual HTTP IT checks the Tomcat header; here also inspect the saved Servlet Cookie.
    Cookie cookie = response.getCookie(name);
    if (cookie != null
        && cookie.getAttribute("SameSite") != null
        && !attributes.contains("SameSite=")) {
      attributes += "; SameSite=" + cookie.getAttribute("SameSite");
    }
    return attributes;
  }
}
