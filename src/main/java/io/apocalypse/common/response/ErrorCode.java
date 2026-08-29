package io.apocalypse.common.response;

import lombok.Getter;

/**
 * 统一错误码。段位约定：
 *
 * <ul>
 *   <li>0 —— 成功
 *   <li>4xxxx —— 客户端/请求侧错误（与 HTTP 4xx 语义对齐）
 *   <li>5xxxx —— 服务端/系统错误
 *   <li>1xxxx —— 业务通用错误（各模块可在 10000-19999 内细分）
 * </ul>
 */
@Getter
public enum ErrorCode {
  SUCCESS(0, "success"),
  BIZ_ERROR(10000, "业务处理失败"),
  PARAM_INVALID(40000, "参数校验失败"),
  UNAUTHORIZED(40100, "未认证或凭证无效"),
  FORBIDDEN(40300, "无访问权限"),
  NOT_FOUND(40400, "资源不存在"),
  TOO_MANY_REQUESTS(42900, "请求过于频繁"),
  ACCOUNT_LOCKED(42901, "失败次数过多，账号已临时锁定"),
  SYSTEM_ERROR(50000, "系统内部错误");

  private final int code;

  private final String message;

  ErrorCode(int code, String message) {
    this.code = code;
    this.message = message;
  }
}
