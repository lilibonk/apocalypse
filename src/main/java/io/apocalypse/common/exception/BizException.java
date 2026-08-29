package io.apocalypse.common.exception;

import io.apocalypse.common.response.ErrorCode;

import lombok.Getter;

/** 业务异常。全局异常处理器统一将其转换为 {@link io.apocalypse.common.response.R} 响应。 */
@Getter
public class BizException extends RuntimeException {

  private final int code;

  public BizException(String message) {
    this(ErrorCode.SYSTEM_ERROR.getCode(), message);
  }

  public BizException(ErrorCode errorCode) {
    this(errorCode.getCode(), errorCode.getMessage());
  }

  public BizException(int code, String message) {
    super(message);
    this.code = code;
  }
}
