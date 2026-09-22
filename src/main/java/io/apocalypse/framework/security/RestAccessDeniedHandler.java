package io.apocalypse.framework.security;

import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.common.response.R;
import io.apocalypse.framework.web.HttpBusinessMetrics;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;
import tools.jackson.databind.ObjectMapper;

/** 已认证但无权限：与全局异常风格一致，HTTP 200 + {@link R} 结构（code=40300）。 */
@Component
@RequiredArgsConstructor
public class RestAccessDeniedHandler implements AccessDeniedHandler {

  private final ObjectMapper objectMapper;

  @Override
  public void handle(
      HttpServletRequest request,
      HttpServletResponse response,
      AccessDeniedException accessDeniedException)
      throws IOException {
    response.setStatus(HttpServletResponse.SC_OK);
    response.setContentType(MediaType.APPLICATION_JSON_VALUE);
    response.setCharacterEncoding(StandardCharsets.UTF_8.name());
    HttpBusinessMetrics.recordCode(request, ErrorCode.FORBIDDEN.getCode());
    response.getWriter().write(objectMapper.writeValueAsString(R.fail(ErrorCode.FORBIDDEN)));
  }
}
