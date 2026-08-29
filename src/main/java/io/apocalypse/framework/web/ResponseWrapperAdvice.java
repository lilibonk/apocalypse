package io.apocalypse.framework.web;

import io.apocalypse.common.response.R;

import org.springframework.core.MethodParameter;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;

import lombok.RequiredArgsConstructor;
import tools.jackson.databind.ObjectMapper;

/**
 * 统一响应包装：Controller 返回裸对象时自动包一层 {@link R#ok(Object)}。 已是 {@link R} 的返回类型原样放行； springdoc 与 actuator
 * 端点不包装（避免破坏其原生契约）。
 */
@RestControllerAdvice
@RequiredArgsConstructor
public class ResponseWrapperAdvice implements ResponseBodyAdvice<Object> {

  private final ObjectMapper objectMapper;

  @Override
  public boolean supports(
      MethodParameter returnType, Class<? extends HttpMessageConverter<?>> converterType) {
    Class<?> declaringClass = returnType.getContainingClass();
    // 已是统一响应结构的不再包装
    if (R.class.isAssignableFrom(returnType.getParameterType())) {
      return false;
    }
    String packageName = declaringClass.getPackageName();
    // 排除 springdoc（/v3/api-docs、swagger-ui）与 actuator 端点
    // （Boot 4.x 端点类分散在 org.springframework.boot.health/micrometer 等子包，统一按前缀排除）
    return !packageName.startsWith("org.springdoc")
        && !packageName.startsWith("org.springframework.boot");
  }

  @Override
  public Object beforeBodyWrite(
      Object body,
      MethodParameter returnType,
      MediaType selectedContentType,
      Class<? extends HttpMessageConverter<?>> selectedConverterType,
      ServerHttpRequest request,
      ServerHttpResponse response) {
    if (body instanceof R<?> r) {
      return r;
    }
    // String 返回类型由 StringHttpMessageConverter 处理，直接返回 R 会触发 ClassCastException，
    // 这里手动序列化为 JSON 字符串并强制 contentType 为 application/json
    if (body instanceof String) {
      response.getHeaders().setContentType(MediaType.APPLICATION_JSON);
      return objectMapper.writeValueAsString(R.ok(body));
    }
    return R.ok(body);
  }
}
