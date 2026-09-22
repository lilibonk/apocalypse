package io.apocalypse.framework.web;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

import org.springframework.http.server.observation.ServerRequestObservationContext;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerMapping;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.observation.Observation;
import io.micrometer.observation.ObservationHandler;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * HTTP 请求结束时记录业务结果；复用 Servlet observation 的同步/异步完成生命周期，不读取响应体。
 *
 * <p>只有 R.code=0 是业务成功；无 R 的二进制/管理端点成功响应为 unclassified。路由仅使用实际匹配的 HandlerMethod 模板，过滤器提前拒绝或未匹配请求统一
 * UNKNOWN。
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class HttpBusinessMetrics implements ObservationHandler<ServerRequestObservationContext> {

  public static final String METER_NAME = "apocalypse.http.business.requests";

  private static final String STATE_ATTRIBUTE = HttpBusinessMetrics.class.getName() + ".state";

  private final MeterRegistry meterRegistry;

  @Override
  public boolean supportsContext(Observation.Context context) {
    return context instanceof ServerRequestObservationContext;
  }

  @Override
  public void onStart(ServerRequestObservationContext context) {
    state(context.getCarrier());
  }

  /** 在已知 R 写出点记录有限枚举，不保留业务码、消息、数据或身份信息。 */
  public static void recordCode(HttpServletRequest request, int code) {
    state(request).result = Result.fromCode(code);
  }

  @Override
  public void onStop(ServerRequestObservationContext context) {
    HttpServletRequest request = context.getCarrier();
    RequestState state = state(request);
    if (!state.recorded.compareAndSet(false, true)) {
      return;
    }
    HttpServletResponse response = context.getResponse();
    int status = response == null ? 0 : response.getStatus();
    Result result = state.result;
    if (context.getError() != null || status >= 500) {
      result = Result.SYSTEM_ERROR;
    } else if (status >= 400) {
      result = Result.fromStatus(status);
    }
    try {
      meterRegistry
          .counter(METER_NAME, "route", route(context), "result", result.tag())
          .increment();
    } catch (RuntimeException e) {
      // 观测失败不得替换业务响应或中断响应完成。
      log.warn("HTTP业务结果指标写入失败", e);
    }
  }

  private static String route(ServerRequestObservationContext context) {
    Object handler =
        context.getCarrier().getAttribute(HandlerMapping.BEST_MATCHING_HANDLER_ATTRIBUTE);
    String pattern = context.getPathPattern();
    return handler instanceof HandlerMethod && StringUtils.hasText(pattern) ? pattern : "UNKNOWN";
  }

  private static RequestState state(HttpServletRequest request) {
    Object existing = request.getAttribute(STATE_ATTRIBUTE);
    if (existing instanceof RequestState value) {
      return value;
    }
    synchronized (request) {
      existing = request.getAttribute(STATE_ATTRIBUTE);
      if (existing instanceof RequestState value) {
        return value;
      }
      RequestState created = new RequestState();
      request.setAttribute(STATE_ATTRIBUTE, created);
      return created;
    }
  }

  private static final class RequestState {

    private final AtomicBoolean recorded = new AtomicBoolean();

    private volatile Result result = Result.UNCLASSIFIED;
  }

  private enum Result {
    SUCCESS,
    VALIDATION,
    AUTHENTICATION,
    AUTHORIZATION,
    NOT_FOUND,
    RATE_LIMITED,
    CONFLICT,
    SYSTEM_ERROR,
    OTHER,
    UNCLASSIFIED;

    private String tag() {
      return name().toLowerCase(Locale.ROOT);
    }

    private static Result fromCode(int code) {
      return switch (code) {
        case 0 -> SUCCESS;
        case 40000 -> VALIDATION;
        case 40100 -> AUTHENTICATION;
        case 40300 -> AUTHORIZATION;
        case 40400 -> NOT_FOUND;
        case 40900 -> CONFLICT;
        case 42900, 42901 -> RATE_LIMITED;
        case 50000 -> SYSTEM_ERROR;
        default -> OTHER;
      };
    }

    private static Result fromStatus(int status) {
      return switch (status) {
        case 400, 422 -> VALIDATION;
        case 401 -> AUTHENTICATION;
        case 403 -> AUTHORIZATION;
        case 404 -> NOT_FOUND;
        case 409 -> CONFLICT;
        case 429 -> RATE_LIMITED;
        default -> OTHER;
      };
    }
  }
}
