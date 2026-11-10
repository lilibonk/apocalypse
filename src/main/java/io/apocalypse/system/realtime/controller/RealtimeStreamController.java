package io.apocalypse.system.realtime.controller;

import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.framework.security.LiveAuthorizationService;
import io.apocalypse.framework.security.SecurityUtils;
import io.apocalypse.system.realtime.service.RealtimePulseHub;

import org.springframework.http.MediaType;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import lombok.RequiredArgsConstructor;

/** 实时脉冲 SSE 订阅端点（FE-W7 / M1）：仅对已认证用户开放轻量失效流。 */
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
    LiveAuthorizationService.requireUserToken(
        SecurityContextHolder.getContext().getAuthentication());
    return realtimePulseHub.subscribe(userId, username);
  }
}
