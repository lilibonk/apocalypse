package io.apocalypse.common.response;

import java.io.Serializable;

import org.slf4j.MDC;

/**
 * 统一响应体。
 *
 * @param code 业务错误码，0 表示成功，见 {@link ErrorCode}
 * @param message 提示信息
 * @param data 业务数据
 * @param traceId 链路追踪 ID（由 framework-web 的过滤器写入 MDC）
 * @param timestamp 服务端时间戳（epoch milli）
 */
public record R<T>(int code, String message, T data, String traceId, long timestamp)
    implements Serializable {

  public static <T> R<T> ok(T data) {
    return new R<>(
        ErrorCode.SUCCESS.getCode(),
        ErrorCode.SUCCESS.getMessage(),
        data,
        currentTraceId(),
        System.currentTimeMillis());
  }

  public static R<Void> ok() {
    return ok(null);
  }

  public static <T> R<T> fail(ErrorCode errorCode) {
    return fail(errorCode.getCode(), errorCode.getMessage());
  }

  public static <T> R<T> fail(int code, String message) {
    return new R<>(code, message, null, currentTraceId(), System.currentTimeMillis());
  }

  static String currentTraceId() {
    String traceId = MDC.get("traceId");
    return traceId == null ? "" : traceId;
  }
}
