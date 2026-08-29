package io.apocalypse.framework.web;

import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.common.response.R;

import jakarta.validation.ConstraintViolationException;

import java.util.stream.Collectors;

import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.validation.BindException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import lombok.extern.slf4j.Slf4j;

/**
 * 全局异常处理器：统一将异常转换为 {@link R} 响应（HTTP 200，业务码区分错误）。 约定见 AGENTS.md——Controller 不手写 try-catch，业务错误抛
 * {@link BizException}。
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

  /** 业务异常：使用异常自带错误码。 */
  @ExceptionHandler(BizException.class)
  public R<Void> handleBizException(BizException e) {
    log.warn("业务异常: code={}, message={}", e.getCode(), e.getMessage());
    return R.fail(e.getCode(), e.getMessage());
  }

  /**
   * @RequestBody / @ModelAttribute 校验失败：拼接字段错误信息。
   */
  @ExceptionHandler({MethodArgumentNotValidException.class, BindException.class})
  public R<Void> handleBindException(BindException e) {
    String message =
        e.getBindingResult().getFieldErrors().stream()
            .map(FieldError::getDefaultMessage)
            .collect(Collectors.joining("; "));
    return R.fail(ErrorCode.PARAM_INVALID.getCode(), message);
  }

  /** 方法参数（@RequestParam / @PathVariable）校验失败。 */
  @ExceptionHandler(ConstraintViolationException.class)
  public R<Void> handleConstraintViolation(ConstraintViolationException e) {
    String message =
        e.getConstraintViolations().stream()
            .map(v -> v.getPropertyPath() + " " + v.getMessage())
            .collect(Collectors.joining("; "));
    return R.fail(ErrorCode.PARAM_INVALID.getCode(), message);
  }

  /** 已认证但无权限。 */
  @ExceptionHandler(AccessDeniedException.class)
  public R<Void> handleAccessDenied(AccessDeniedException e) {
    return R.fail(ErrorCode.FORBIDDEN);
  }

  /** 未认证或凭证无效。 */
  @ExceptionHandler(AuthenticationException.class)
  public R<Void> handleAuthentication(AuthenticationException e) {
    return R.fail(ErrorCode.UNAUTHORIZED);
  }

  /** 静态资源/路径不存在（Spring 6.1+ 默认抛 NoResourceFoundException）。 */
  @ExceptionHandler(NoResourceFoundException.class)
  public R<Void> handleNoResourceFound(NoResourceFoundException e) {
    return R.fail(ErrorCode.NOT_FOUND);
  }

  /** 兜底：不向外泄漏内部细节，服务端打完整堆栈。 */
  @ExceptionHandler(Exception.class)
  public R<Void> handleException(Exception e) {
    log.error("系统内部错误", e);
    return R.fail(ErrorCode.SYSTEM_ERROR);
  }
}
