package io.apocalypse.system.realtime.service;

import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.framework.security.AuthorizationSnapshot;
import io.apocalypse.framework.security.SessionInvalidatedEvent;
import io.apocalypse.framework.security.UserAuthorizationQuery;
import io.apocalypse.system.realtime.dto.response.RealtimePulseResp;

import java.io.IOException;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import lombok.extern.slf4j.Slf4j;

/**
 * 实时水脉推送中枢（单实例受控 SSE）：
 *
 * <ul>
 *   <li>强制每用户并发连接上限与单实例全局连接上限，防止连接泄漏耗尽 Servlet 线程/文件描述符；
 *   <li>定时发送 {@code :keepalive} 心跳注释帧并驱逐 JWT 已过期连接；
 *   <li>在会话/权限变更事务提交后立即物理断开受影响连接，并按实时权限快照过滤推送主题。
 * </ul>
 */
@Slf4j
@Service
public class RealtimePulseHub {

  private final RealtimeProperties properties;

  private final ObjectProvider<Clock> clockProvider;

  private final ObjectProvider<UserAuthorizationQuery> userAuthorizationQueryProvider;

  private final Object registrationLock = new Object();

  private final List<Subscription> subscriptions = new CopyOnWriteArrayList<>();

  public RealtimePulseHub(ObjectProvider<Clock> clockProvider) {
    this(new RealtimeProperties(), clockProvider, null);
  }

  @Autowired
  public RealtimePulseHub(
      RealtimeProperties properties,
      ObjectProvider<Clock> clockProvider,
      ObjectProvider<UserAuthorizationQuery> userAuthorizationQueryProvider) {
    this.properties = properties == null ? new RealtimeProperties() : properties;
    this.clockProvider = clockProvider;
    this.userAuthorizationQueryProvider = userAuthorizationQueryProvider;
  }

  public SseEmitter subscribe(Long userId, String username) {
    return subscribe(userId, username, null, null);
  }

  public SseEmitter subscribe(Long userId, String username, String jti, Instant expiresAt) {
    Instant currentNow = now();
    if (expiresAt != null && !expiresAt.isAfter(currentNow)) {
      throw new BizException(ErrorCode.UNAUTHORIZED.getCode(), "凭证已失效");
    }

    SseEmitter emitter = createEmitter(properties.getStreamTimeoutMs());
    Subscription subscription = new Subscription(userId, username, jti, expiresAt, emitter);
    List<Subscription> evicted = new ArrayList<>();

    synchronized (registrationLock) {
      evictExpiredLocked(currentNow, evicted);
      evictOverflowForUserLocked(userId, properties.getMaxConnectionsPerUser(), evicted);
      int maxTotal = Math.max(1, properties.getMaxTotalConnections());
      if (subscriptions.size() >= maxTotal) {
        evicted.forEach(this::completeQuietly);
        throw new BizException(ErrorCode.TOO_MANY_REQUESTS.getCode(), "实时连接数已达上限，请稍后重试");
      }
      subscriptions.add(subscription);
    }
    evicted.forEach(this::completeQuietly);

    Runnable cleanup = () -> subscriptions.remove(subscription);
    emitter.onCompletion(cleanup);
    emitter.onTimeout(
        () -> {
          cleanup.run();
          completeQuietly(subscription);
        });
    emitter.onError(ex -> cleanup.run());

    try {
      emitter.send(
          SseEmitter.event()
              .name("connected")
              .data(new RealtimePulseResp("connected", currentNow), MediaType.APPLICATION_JSON));
    } catch (IOException | RuntimeException ex) {
      cleanup.run();
      completeQuietly(subscription);
    }
    return emitter;
  }

  @Scheduled(fixedDelayString = "${apocalypse.realtime.heartbeat-interval-ms:25000}")
  public void heartbeat() {
    if (subscriptions.isEmpty()) {
      return;
    }
    Instant currentNow = now();
    for (Subscription sub : subscriptions) {
      if (isExpired(sub, currentNow)) {
        subscriptions.remove(sub);
        completeQuietly(sub);
        continue;
      }
      try {
        sub.emitter().send(SseEmitter.event().comment("keepalive"));
      } catch (IOException | RuntimeException ex) {
        subscriptions.remove(sub);
        completeQuietly(sub);
      }
    }
  }

  /** 在注销、踢出或权限代次提升提交后，立即断开受影响会话的 SSE 长连接。 */
  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
  public void onSessionInvalidated(SessionInvalidatedEvent event) {
    if (event == null || subscriptions.isEmpty()) {
      return;
    }
    for (Subscription sub : subscriptions) {
      boolean matched =
          switch (event.scope()) {
            case GLOBAL -> true;
            case USER -> event.username() != null && event.username().equals(sub.username());
            case JTI -> event.jti() != null && event.jti().equals(sub.jti());
          };
      if (matched) {
        subscriptions.remove(sub);
        completeQuietly(sub);
      }
    }
  }

  public void broadcast(String topic) {
    if (subscriptions.isEmpty()) {
      return;
    }
    Instant currentNow = now();
    RealtimePulseResp payload = new RealtimePulseResp(topic, currentNow);
    UserAuthorizationQuery authQuery =
        userAuthorizationQueryProvider == null
            ? null
            : userAuthorizationQueryProvider.getIfAvailable();

    for (Subscription sub : subscriptions) {
      if (isExpired(sub, currentNow)) {
        subscriptions.remove(sub);
        completeQuietly(sub);
        continue;
      }
      if (!allowsTopic(authQuery, sub, topic, currentNow)) {
        continue;
      }
      try {
        sub.emitter()
            .send(SseEmitter.event().name("pulse").data(payload, MediaType.APPLICATION_JSON));
      } catch (IOException | RuntimeException ex) {
        subscriptions.remove(sub);
        completeQuietly(sub);
      }
    }
  }

  public int activeSubscriptionCount() {
    return subscriptions.size();
  }

  protected SseEmitter createEmitter(long timeoutMs) {
    return new SseEmitter(timeoutMs);
  }

  private boolean allowsTopic(
      UserAuthorizationQuery authQuery, Subscription sub, String topic, Instant currentNow) {
    if (authQuery == null) {
      return true;
    }
    AuthorizationSnapshot snapshot;
    try {
      snapshot = authQuery.read(sub.userId(), sub.username(), currentNow);
    } catch (RuntimeException ex) {
      log.debug("SSE 订阅者实时授权失效，断开连接: username={}, reason={}", sub.username(), ex.getMessage());
      subscriptions.remove(sub);
      completeQuietly(sub);
      return false;
    }
    return switch (topic) {
      case "onlineChanged" -> snapshot.allows("system:online:list");
      case "loginSucceeded" ->
          snapshot.allows("system:log:login") || snapshot.allows("system:online:list");
      case "operationLogged" -> snapshot.allows("system:log:oper");
      case "authorizationChanged" ->
          snapshot.allows("system:role:list") || snapshot.allows("system:permission:list");
      default -> false;
    };
  }

  private void evictExpiredLocked(Instant currentNow, List<Subscription> evicted) {
    for (Subscription sub : subscriptions) {
      if (isExpired(sub, currentNow)) {
        subscriptions.remove(sub);
        evicted.add(sub);
      }
    }
  }

  private void evictOverflowForUserLocked(Long userId, int maxPerUser, List<Subscription> evicted) {
    int limit = Math.max(1, maxPerUser);
    List<Subscription> userSubs =
        subscriptions.stream().filter(sub -> userId.equals(sub.userId())).toList();
    int excess = userSubs.size() - limit + 1;
    for (int i = 0; i < excess; i++) {
      Subscription oldest = userSubs.get(i);
      subscriptions.remove(oldest);
      evicted.add(oldest);
    }
  }

  private boolean isExpired(Subscription sub, Instant currentNow) {
    return sub.expiresAt() != null && !sub.expiresAt().isAfter(currentNow);
  }

  private void completeQuietly(Subscription sub) {
    try {
      sub.emitter().complete();
    } catch (RuntimeException ignored) {
      // emitter 可能已在并发路径上提前完成或断开
    }
  }

  private Instant now() {
    Clock clock = clockProvider == null ? null : clockProvider.getIfAvailable(Clock::systemUTC);
    return (clock == null ? Clock.systemUTC() : clock).instant();
  }

  private record Subscription(
      Long userId, String username, String jti, Instant expiresAt, SseEmitter emitter) {}
}
