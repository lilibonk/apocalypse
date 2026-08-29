package io.apocalypse.framework.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;
import java.util.UUID;

import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * 链路追踪过滤器：取请求头 {@code X-Trace-Id}，缺失则生成 32 位 UUID，写入 MDC（key= {@code traceId}）供日志 pattern
 * 使用，并回写响应头。
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class TraceIdFilter extends OncePerRequestFilter {

  /** 请求/响应头名称。 */
  public static final String TRACE_ID_HEADER = "X-Trace-Id";

  /** MDC key，logging pattern 中以 %X{traceId} 引用。 */
  public static final String TRACE_ID_MDC_KEY = "traceId";

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
      throws ServletException, IOException {
    String traceId = request.getHeader(TRACE_ID_HEADER);
    if (!StringUtils.hasText(traceId)) {
      traceId = UUID.randomUUID().toString().replace("-", "");
    }
    MDC.put(TRACE_ID_MDC_KEY, traceId);
    response.setHeader(TRACE_ID_HEADER, traceId);
    try {
      filterChain.doFilter(request, response);
    } finally {
      MDC.clear();
    }
  }
}
