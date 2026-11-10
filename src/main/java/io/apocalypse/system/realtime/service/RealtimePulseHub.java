package io.apocalypse.system.realtime.service;

import io.apocalypse.system.realtime.dto.response.RealtimePulseResp;

import java.io.IOException;
import java.time.Clock;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import lombok.RequiredArgsConstructor;

/**
 * 实时水脉推送中枢（FE-W7 / M1）：
 *
 * <ul>
 *   <li>仅向已认证用户会话推送轻量级缓存失效信号（不含任何敏感数据，客户端收到后按自身实时权限重新拉取 Query）；
 *   <li>客户端断开、超时或写出异常时自动清理订阅句柄，防内存泄漏。
 * </ul>
 */
@Service
@RequiredArgsConstructor
public class RealtimePulseHub {

  private static final long DEFAULT_TIMEOUT_MS = 300_000L;

  private final ObjectProvider<Clock> clockProvider;

  private final List<Subscription> subscriptions = new CopyOnWriteArrayList<>();

  public SseEmitter subscribe(Long userId, String username) {
    SseEmitter emitter = new SseEmitter(DEFAULT_TIMEOUT_MS);
    Subscription subscription = new Subscription(userId, username, emitter);
    subscriptions.add(subscription);

    Runnable cleanup = () -> subscriptions.remove(subscription);
    emitter.onCompletion(cleanup);
    emitter.onTimeout(
        () -> {
          cleanup.run();
          emitter.complete();
        });
    emitter.onError(ex -> cleanup.run());

    try {
      emitter.send(
          SseEmitter.event()
              .name("connected")
              .data(new RealtimePulseResp("connected", now()), MediaType.APPLICATION_JSON));
    } catch (IOException ex) {
      cleanup.run();
    }
    return emitter;
  }

  public void broadcast(String topic) {
    if (subscriptions.isEmpty()) {
      return;
    }
    RealtimePulseResp payload = new RealtimePulseResp(topic, now());
    for (Subscription sub : subscriptions) {
      try {
        sub.emitter()
            .send(SseEmitter.event().name("pulse").data(payload, MediaType.APPLICATION_JSON));
      } catch (IOException | IllegalStateException ex) {
        subscriptions.remove(sub);
      }
    }
  }

  public int activeSubscriptionCount() {
    return subscriptions.size();
  }

  private java.time.Instant now() {
    return clockProvider.getIfAvailable(Clock::systemUTC).instant();
  }

  private record Subscription(Long userId, String username, SseEmitter emitter) {}
}
