package io.apocalypse.framework.security;

import io.apocalypse.system.authorization.mapper.DataScopeMapper;
import io.apocalypse.system.authorization.service.DataScopeService;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;

import org.aopalliance.intercept.MethodInvocation;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AuthorizationScopeContextTest {
  @AfterEach
  void clear() {
    if (TransactionSynchronizationManager.isSynchronizationActive()) {
      TransactionSynchronizationManager.clearSynchronization();
    }
    TransactionSynchronizationManager.setActualTransactionActive(false);
    SecurityContextHolder.clearContext();
  }

  @Test
  void newMethodInSameTransactionCannotReuseEarlierAllScopeAfterWindowCloses() throws Exception {
    var jwt =
        Jwt.withTokenValue("test")
            .header("alg", "HS256")
            .subject("alice")
            .claim("type", "access")
            .claim("uid", 7L)
            .claim("av", 0L)
            .claim("uv", 0L)
            .claim("cv", 0L)
            .build();
    SecurityContextHolder.getContext()
        .setAuthentication(new JwtAuthenticationToken(jwt, List.of()));
    var live = mock(LiveAuthorizationService.class);
    when(live.current()).thenReturn(snapshot(true));
    var registry =
        new PermissionActionRegistry(
            List.of(
                new PermissionActionDefinition(
                    List.of(
                        PermissionActionRegistry.Action.business(
                            "system:user:list", null, true)))));
    var service =
        new DataScopeService(
            mock(DataScopeMapper.class),
            live,
            registry,
            Clock.fixed(Instant.EPOCH, ZoneOffset.UTC));
    TransactionSynchronizationManager.initSynchronization();
    TransactionSynchronizationManager.setActualTransactionActive(true);
    service.lockForWrite();
    assertThat(service.resolve("system:user:list").all()).isTrue();
    var invocation = mock(MethodInvocation.class);
    when(invocation.getMethod()).thenReturn(getClass().getDeclaredMethod("probe"));
    when(invocation.getThis()).thenReturn(this);
    try (var ignored = AuthorizationInvocationContext.enter(invocation, auth -> snapshot(false))) {
      assertThat(service.resolve("system:user:list").all()).isFalse();
      assertThat(service.resolve("system:user:list").departmentIds()).containsExactly(11L);
    }
    // 外层已受理事务可完成，新的方法调用不能把这个旧结果借作更宽授权。
    assertThat(service.resolve("system:user:list").all()).isTrue();
  }

  private void probe() {}

  private static AuthorizationSnapshot snapshot(boolean all) {
    return new AuthorizationSnapshot(
        7L,
        "alice",
        new TokenVersionStore.VersionSnapshot(0, 0, 0),
        Instant.EPOCH,
        null,
        List.of("reader"),
        List.of("system:user:list"),
        List.of("system:user:list"),
        Map.of("system:user:list", new AuthorizationScope(all, List.of(11L))),
        "scope");
  }
}
