package io.apocalypse.system.realtime.controller;

import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.framework.security.LiveAuthorizationService;
import io.apocalypse.framework.security.SecurityUtils;
import io.apocalypse.system.realtime.service.RealtimePulseHub;

import jakarta.servlet.http.HttpServletResponse;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import lombok.RequiredArgsConstructor;

/** 实时脉冲 SSE 订阅端点（认证用户自服务通道，须通过 {@link LiveAuthorizationService#requireUserToken} 校验）。 */
@RestController
@RequestMapping("/system/realtime")
@RequiredArgsConstructor
public class RealtimeStreamController {

  private final RealtimePulseHub realtimePulseHub;

  @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
  public SseEmitter stream() {
    Long userId =
        SecurityUtils.currentUserId().orElseThrow(() -> new BizException(ErrorCode.UNAUTHORIZED));
    String username =
        SecurityUtils.currentUsername().orElseThrow(() -> new BizException(ErrorCode.UNAUTHORIZED));
    Jwt jwt =
        LiveAuthorizationService.requireUserToken(
            SecurityContextHolder.getContext().getAuthentication());
    applyStreamingHeaders();
    return realtimePulseHub.subscribe(userId, username, jwt.getId(), jwt.getExpiresAt());
  }

  private static void applyStreamingHeaders() {
    if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attrs) {
      HttpServletResponse response = attrs.getResponse();
      if (response != null) {
        response.setHeader("X-Accel-Buffering", "no");
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
      }
    }
  }
}
