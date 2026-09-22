package io.apocalypse.framework.security;

import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.common.response.R;
import io.apocalypse.framework.web.HttpBusinessMetrics;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import org.springframework.http.MediaType;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;
import tools.jackson.databind.ObjectMapper;

/** 未认证入口：与全局异常风格一致，HTTP 200 + {@link R} 结构（code=40100），替代默认的空 body 401。 */
@Component
@RequiredArgsConstructor
public class RestAuthenticationEntryPoint implements AuthenticationEntryPoint {

  private final ObjectMapper objectMapper;

  @Override
  public void commence(
      HttpServletRequest request,
      HttpServletResponse response,
      AuthenticationException authException)
      throws IOException {
    response.setStatus(HttpServletResponse.SC_OK);
    response.setContentType(MediaType.APPLICATION_JSON_VALUE);
    response.setCharacterEncoding(StandardCharsets.UTF_8.name());
    HttpBusinessMetrics.recordCode(request, ErrorCode.UNAUTHORIZED.getCode());
    response.getWriter().write(objectMapper.writeValueAsString(R.fail(ErrorCode.UNAUTHORIZED)));
  }
}
