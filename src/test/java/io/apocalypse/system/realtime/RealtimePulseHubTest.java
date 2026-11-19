package io.apocalypse.system.realtime;

import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.framework.security.AuthorizationSnapshot;
import io.apocalypse.framework.security.SessionInvalidatedEvent;
import io.apocalypse.framework.security.TokenVersionStore;
import io.apocalypse.framework.security.UserAuthorizationQuery;
import io.apocalypse.system.realtime.dto.response.RealtimePulseResp;
import io.apocalypse.system.realtime.service.RealtimeProperties;
import io.apocalypse.system.realtime.service.RealtimePulseHub;

import java.io.IOException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyEmitter;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** {@link RealtimePulseHub} 单元测试：连接上限、心跳驱逐、注销断流与主题权限过滤。 */
class RealtimePulseHubTest {

  private static final Instant START = Instant.parse("2026-11-19T12:00:00Z");

  @Test
  void enforcesPerUserEvictionAndGlobalConnectionCap() {
    RealtimeProperties props = new RealtimeProperties();
    props.setMaxConnectionsPerUser(2);
    props.setMaxTotalConnections(3);

    MutableClock clock = new MutableClock(START);
    List<RecordingEmitter> created = new ArrayList<>();
    RealtimePulseHub hub = newTestableHub(props, clock, null, created);

    hub.subscribe(1L, "alice", "jti-1", START.plusSeconds(300));
    hub.subscribe(1L, "alice", "jti-2", START.plusSeconds(300));
    assertThat(hub.activeSubscriptionCount()).isEqualTo(2);

    // 第 3 个同账号连接应驱逐最早的 jti-1
    hub.subscribe(1L, "alice", "jti-3", START.plusSeconds(300));
    assertThat(hub.activeSubscriptionCount()).isEqualTo(2);
    assertThat(created.get(0).completed.get()).isTrue();
    assertThat(created.get(1).completed.get()).isFalse();
    assertThat(created.get(2).completed.get()).isFalse();

    // 另一用户占满全局上限 3
    hub.subscribe(2L, "bob", "jti-bob-1", START.plusSeconds(300));
    assertThat(hub.activeSubscriptionCount()).isEqualTo(3);

    // 再新增第 4 条总连接触发 42900 拒绝
    assertThatThrownBy(() -> hub.subscribe(2L, "bob", "jti-bob-2", START.plusSeconds(300)))
        .isInstanceOf(BizException.class)
        .satisfies(
            ex ->
                assertThat(((BizException) ex).getCode())
                    .isEqualTo(ErrorCode.TOO_MANY_REQUESTS.getCode()));
  }

  @Test
  void heartbeatSendsKeepaliveAndEvictsExpiredToken() {
    RealtimeProperties props = new RealtimeProperties();
    MutableClock clock = new MutableClock(START);
    List<RecordingEmitter> created = new ArrayList<>();
    RealtimePulseHub hub = newTestableHub(props, clock, null, created);

    hub.subscribe(1L, "alice", "jti-short", START.plusSeconds(10));
    hub.subscribe(2L, "bob", "jti-long", START.plusSeconds(120));
    assertThat(hub.activeSubscriptionCount()).isEqualTo(2);

    // 未过期前双双收到 keepalive
    clock.set(START.plusSeconds(5));
    hub.heartbeat();
    assertThat(created.get(0).events).hasSize(2);
    assertThat(created.get(1).events).hasSize(2);

    // jti-short 到期后被心跳清理完成，jti-long 继续收到 keepalive
    clock.set(START.plusSeconds(10));
    hub.heartbeat();
    assertThat(created.get(0).completed.get()).isTrue();
    assertThat(created.get(1).completed.get()).isFalse();
    assertThat(created.get(1).events).hasSize(3);
    assertThat(hub.activeSubscriptionCount()).isEqualTo(1);
  }

  @Test
  void invalidationEventsCloseMatchingSessionsByScope() {
    RealtimeProperties props = new RealtimeProperties();
    MutableClock clock = new MutableClock(START);
    List<RecordingEmitter> created = new ArrayList<>();
    RealtimePulseHub hub = newTestableHub(props, clock, null, created);

    hub.subscribe(1L, "alice", "jti-a1", START.plusSeconds(300));
    hub.subscribe(1L, "alice", "jti-a2", START.plusSeconds(300));
    hub.subscribe(2L, "bob", "jti-b1", START.plusSeconds(300));
    hub.subscribe(3L, "carol", "jti-c1", START.plusSeconds(300));

    // JTI 级别仅关闭 jti-a1
    hub.onSessionInvalidated(SessionInvalidatedEvent.forJti("jti-a1"));
    assertThat(created.get(0).completed.get()).isTrue();
    assertThat(created.get(1).completed.get()).isFalse();
    assertThat(hub.activeSubscriptionCount()).isEqualTo(3);

    // USER 级别关闭 alice 剩余会话，保留 bob / carol
    hub.onSessionInvalidated(SessionInvalidatedEvent.forUser("alice"));
    assertThat(created.get(1).completed.get()).isTrue();
    assertThat(created.get(2).completed.get()).isFalse();
    assertThat(created.get(3).completed.get()).isFalse();
    assertThat(hub.activeSubscriptionCount()).isEqualTo(2);

    // GLOBAL 级别关闭全部剩余会话
    hub.onSessionInvalidated(SessionInvalidatedEvent.forGlobal());
    assertThat(created.get(2).completed.get()).isTrue();
    assertThat(created.get(3).completed.get()).isTrue();
    assertThat(hub.activeSubscriptionCount()).isZero();
  }

  @Test
  void broadcastFiltersByLiveTopicPermissionAndEvictsDisabledSubscriber() {
    RealtimeProperties props = new RealtimeProperties();
    MutableClock clock = new MutableClock(START);
    List<RecordingEmitter> created = new ArrayList<>();

    UserAuthorizationQuery authQuery = mock(UserAuthorizationQuery.class);
    when(authQuery.read(1L, "auditor", START))
        .thenReturn(
            snapshot(
                1L, "auditor", List.of("system:log:oper", "system:log:login", "system:role:list")));
    when(authQuery.read(2L, "viewer", START))
        .thenReturn(snapshot(2L, "viewer", List.of("system:online:list")));
    when(authQuery.read(3L, "disabled", START)).thenThrow(new BadCredentialsException("账号已禁用"));

    RealtimePulseHub hub = newTestableHub(props, clock, authQuery, created);
    hub.subscribe(1L, "auditor", "jti-auditor", START.plusSeconds(300));
    hub.subscribe(2L, "viewer", "jti-viewer", START.plusSeconds(300));
    hub.subscribe(3L, "disabled", "jti-disabled", START.plusSeconds(300));

    // 清空 connected 初始事件计数
    created.forEach(emitter -> emitter.events.clear());

    // operationLogged 仅发送给拥有 system:log:oper 的 auditor；disabled 被清理
    hub.broadcast("operationLogged");
    assertThat(created.get(0).events).hasSize(1);
    assertThat(created.get(0).topics()).containsExactly("operationLogged");
    assertThat(created.get(1).events).isEmpty();
    assertThat(created.get(2).completed.get()).isTrue();
    assertThat(hub.activeSubscriptionCount()).isEqualTo(2);

    // onlineChanged 发送给 viewer（system:online:list），不发送给没有 online 权限的 auditor
    hub.broadcast("onlineChanged");
    assertThat(created.get(0).events).hasSize(1);
    assertThat(created.get(1).topics()).containsExactly("onlineChanged");

    // loginSucceeded 允许 system:log:login 或 system:online:list 双方接收
    hub.broadcast("loginSucceeded");
    assertThat(created.get(0).topics()).containsExactly("operationLogged", "loginSucceeded");
    assertThat(created.get(1).topics()).containsExactly("onlineChanged", "loginSucceeded");

    // unknownTopic 对所有订阅者阻断
    hub.broadcast("unmappedSensitiveTopic");
    assertThat(created.get(0).events).hasSize(2);
    assertThat(created.get(1).events).hasSize(2);
  }

  private static AuthorizationSnapshot snapshot(
      Long userId, String username, List<String> executablePerms) {
    return new AuthorizationSnapshot(
        userId,
        username,
        new TokenVersionStore.VersionSnapshot(0, 0, 0),
        START,
        null,
        List.of(),
        executablePerms,
        executablePerms,
        Map.of(),
        "snap-" + username);
  }

  @SuppressWarnings("unchecked")
  private static RealtimePulseHub newTestableHub(
      RealtimeProperties props,
      MutableClock clock,
      UserAuthorizationQuery authQuery,
      List<RecordingEmitter> created) {
    ObjectProvider<Clock> clockProvider = mock(ObjectProvider.class);
    when(clockProvider.getIfAvailable(org.mockito.ArgumentMatchers.any())).thenAnswer(inv -> clock);

    ObjectProvider<UserAuthorizationQuery> authProvider = mock(ObjectProvider.class);
    when(authProvider.getIfAvailable()).thenReturn(authQuery);

    return new RealtimePulseHub(props, clockProvider, authProvider) {
      @Override
      protected SseEmitter createEmitter(long timeoutMs) {
        RecordingEmitter emitter = new RecordingEmitter(timeoutMs);
        created.add(emitter);
        return emitter;
      }
    };
  }

  private static final class RecordingEmitter extends SseEmitter {
    private final List<Set<ResponseBodyEmitter.DataWithMediaType>> events = new ArrayList<>();
    private final AtomicBoolean completed = new AtomicBoolean(false);

    RecordingEmitter(long timeoutMs) {
      super(timeoutMs);
    }

    @Override
    public void send(SseEventBuilder builder) throws IOException {
      if (completed.get()) {
        throw new IllegalStateException("already completed");
      }
      events.add(builder.build());
    }

    @Override
    public void complete() {
      completed.set(true);
    }

    List<String> topics() {
      return events.stream()
          .flatMap(Set::stream)
          .map(ResponseBodyEmitter.DataWithMediaType::getData)
          .filter(RealtimePulseResp.class::isInstance)
          .map(RealtimePulseResp.class::cast)
          .map(RealtimePulseResp::topic)
          .toList();
    }
  }

  private static final class MutableClock extends Clock {
    private final AtomicReference<Instant> ref;

    MutableClock(Instant initial) {
      this.ref = new AtomicReference<>(initial);
    }

    void set(Instant next) {
      ref.set(next);
    }

    @Override
    public java.time.ZoneId getZone() {
      return ZoneOffset.UTC;
    }

    @Override
    public Clock withZone(java.time.ZoneId zone) {
      return this;
    }

    @Override
    public Instant instant() {
      return ref.get();
    }
  }
}
