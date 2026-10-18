package io.apocalypse.framework.security;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Function;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Role;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 实际 Spring 7.1 方法代理验证，不能以直接调用自定义 factory 替代扩展点接通证据。 */
class LiveAuthorizationManagerFactoryTest {
  private static final Instant NOW = Instant.parse("2026-10-18T08:00:00Z");
  private AnnotationConfigApplicationContext context;
  private State state;
  private Probe probe;

  @BeforeEach
  void createContext() {
    context = new AnnotationConfigApplicationContext(Config.class);
    state = context.getBean(State.class);
    probe = context.getBean(Probe.class);
    authenticate("access", List.of());
  }

  @AfterEach
  void closeContext() {
    SecurityContextHolder.clearContext();
    context.close();
    assertThat(AuthorizationInvocationContext.currentSnapshot()).isEmpty();
  }

  @Test
  void liveGrantWorksWithoutJwtAuthorityAndJwtAuthorityCannotOverrideLiveDenial() {
    state.source = at -> snapshot(at, List.of("system:user:list"));
    assertThat(probe.read()).isEqualTo("snapshot");
    assertThat(state.reads).hasValue(1);
    state.source = at -> snapshot(at, List.of());
    authenticate("access", List.of("system:user:list"));
    assertThatThrownBy(probe::read).isInstanceOf(AccessDeniedException.class);
    assertThat(state.reads).hasValue(2);
  }

  @Test
  void andExpressionDoesNotCombineDifferentDatabaseOrTimeSnapshots() {
    state.source =
        at ->
            snapshot(
                at,
                state.reads.get() == 1 ? List.of("system:user:list") : List.of("system:user:edit"));
    assertThatThrownBy(probe::both).isInstanceOf(AccessDeniedException.class);
    assertThat(state.reads).hasValue(1);
    state.reads.set(0);
    assertThatThrownBy(probe::all).isInstanceOf(AccessDeniedException.class);
    assertThat(state.reads).hasValue(1);
  }

  @Test
  void anyAndAllUseOneSnapshotAndTheBoundScopeIsAvailableToTheMethod() {
    state.source = at -> snapshot(at, List.of("system:user:edit"));
    assertThat(probe.any()).isTrue();
    assertThat(state.reads).hasValue(1);
    state.source = at -> snapshot(at, List.of("system:user:list", "system:user:edit"));
    assertThat(probe.all()).isTrue();
    assertThat(state.reads).hasValue(2);
    assertThat(probe.scope()).isEqualTo(List.of(11L));
    assertThat(state.reads).hasValue(3);
  }

  @Test
  void sameTokenCanEnterAndLeaveAWindowWithoutChangingItsClaims() {
    state.source =
        at ->
            snapshot(
                at,
                !at.isBefore(NOW.plusSeconds(10)) && at.isBefore(NOW.plusSeconds(20))
                    ? List.of("system:user:list")
                    : List.of());
    assertThatThrownBy(probe::read).isInstanceOf(AccessDeniedException.class);
    state.clock.at = NOW.plusSeconds(10);
    assertThat(probe.read()).isEqualTo("snapshot");
    state.clock.at = NOW.plusSeconds(20);
    assertThatThrownBy(probe::read).isInstanceOf(AccessDeniedException.class);
  }

  @Test
  void roleAndClientScopeStayIndependentAndClientCannotUseBusinessGrant() {
    authenticate("access", List.of("ROLE_ADMIN"));
    assertThat(probe.role()).isTrue();
    authenticate("client", List.of("SCOPE_management:read"));
    assertThat(probe.client()).isTrue();
    assertThatThrownBy(probe::read).isInstanceOf(AccessDeniedException.class);
    assertThat(state.reads).hasValue(0);
  }

  @Test
  void unknownAndLegacyPermissionsDoNotCreateExecutionAbilities() {
    authenticate("access", List.of("unknown:read", "order:read"));
    assertThatThrownBy(probe::unknown).isInstanceOf(AccessDeniedException.class);
    assertThatThrownBy(probe::legacy).isInstanceOf(AccessDeniedException.class);
    assertThat(state.reads).hasValue(0);
  }

  @Test
  void identityVersionMismatchFailsBeforeExecutingBusinessMethod() {
    state.source =
        at -> {
          var current = snapshot(at, List.of("system:user:list"));
          return new AuthorizationSnapshot(
              current.userId(),
              current.username(),
              new TokenVersionStore.VersionSnapshot(0, 0, 1),
              at,
              null,
              current.roles(),
              current.permissions(),
              current.executablePermissions(),
              current.scopes(),
              current.snapshotId());
        };
    assertThatThrownBy(probe::read).isInstanceOf(BadCredentialsException.class);
  }

  @Test
  void staticHelperCannotUseJwtSnapshotOutsideInvocationOrInAnotherThread() throws Exception {
    authenticate("access", List.of("system:user:list"));
    assertThat(SecurityUtils.hasAuthority("system:user:list")).isFalse();
    state.source = at -> snapshot(at, List.of("system:user:list"));
    assertThat(probe.helper()).isTrue();
    assertThat(probe.childThread()).isFalse();
    assertThat(SecurityUtils.hasAuthority("system:user:list")).isFalse();
  }

  private static AuthorizationSnapshot snapshot(Instant at, List<String> permissions) {
    return new AuthorizationSnapshot(
        7L,
        "alice",
        new TokenVersionStore.VersionSnapshot(0, 0, 0),
        at,
        null,
        List.of("reader"),
        permissions,
        permissions,
        Map.of("system:user:list", new AuthorizationScope(false, List.of(11L))),
        "snapshot");
  }

  private static void authenticate(String type, List<String> authorities) {
    Jwt jwt =
        Jwt.withTokenValue("test-token")
            .header("alg", "HS256")
            .subject("alice")
            .claim("type", type)
            .claim("uid", 7L)
            .claim("av", 0L)
            .claim("uv", 0L)
            .claim("cv", 0L)
            .build();
    SecurityContextHolder.getContext()
        .setAuthentication(
            new JwtAuthenticationToken(
                jwt, authorities.stream().map(SimpleGrantedAuthority::new).toList()));
  }

  static class State {
    final AtomicInteger reads = new AtomicInteger();
    final MutableClock clock = new MutableClock();
    Function<Instant, AuthorizationSnapshot> source = at -> snapshot(at, List.of());
  }

  static class MutableClock extends Clock {
    Instant at = NOW;

    @Override
    public ZoneId getZone() {
      return ZoneOffset.UTC;
    }

    @Override
    public Clock withZone(ZoneId zone) {
      return this;
    }

    @Override
    public Instant instant() {
      return at;
    }
  }

  @Configuration(proxyBeanMethods = false)
  @EnableMethodSecurity
  static class Config {
    @Bean
    State state() {
      return new State();
    }

    @Bean
    Clock clock(State state) {
      return state.clock;
    }

    @Bean
    UserAuthorizationQuery query(State state) {
      return (user, username, at) -> {
        state.reads.incrementAndGet();
        return state.source.apply(at);
      };
    }

    @Bean
    PermissionActionRegistry registry() {
      return new PermissionActionRegistry(
          List.of(
              new PermissionActionDefinition(
                  List.of(
                      PermissionActionRegistry.Action.business("system:user:list", null, true),
                      PermissionActionRegistry.Action.business("system:user:edit", null, true),
                      PermissionActionRegistry.Action.legacy("order:read")))));
    }

    @Bean
    LiveAuthorizationService live(ObjectProvider<UserAuthorizationQuery> query, Clock clock) {
      return new LiveAuthorizationService(query, clock);
    }

    @Bean
    LiveAuthorizationManagerFactory liveFactory(PermissionActionRegistry registry) {
      return new LiveAuthorizationManagerFactory(registry);
    }

    @Bean
    @Role(BeanDefinition.ROLE_INFRASTRUCTURE)
    AuthorizationContextAdvisor contextAdvisor(ObjectProvider<LiveAuthorizationService> service) {
      return new AuthorizationContextAdvisor(service);
    }

    @Bean
    Probe probe() {
      return new Probe();
    }
  }

  static class Probe {
    @PreAuthorize("hasAuthority('system:user:list')")
    public String read() {
      return AuthorizationInvocationContext.currentSnapshot().orElseThrow().snapshotId();
    }

    @PreAuthorize("hasAuthority('system:user:list') and hasAuthority('system:user:edit')")
    public boolean both() {
      return true;
    }

    @PreAuthorize("hasAllAuthorities('system:user:list', 'system:user:edit')")
    public boolean all() {
      return true;
    }

    @PreAuthorize("hasAnyAuthority('system:user:list', 'system:user:edit')")
    public boolean any() {
      return true;
    }

    @PreAuthorize("hasAuthority('system:user:list')")
    public List<Long> scope() {
      return AuthorizationInvocationContext.currentSnapshot()
          .orElseThrow()
          .scopes()
          .get("system:user:list")
          .departmentIds();
    }

    @PreAuthorize("hasRole('ADMIN')")
    public boolean role() {
      return true;
    }

    @PreAuthorize("hasAuthority('SCOPE_management:read')")
    public boolean client() {
      return true;
    }

    @PreAuthorize("hasAuthority('unknown:read')")
    public boolean unknown() {
      return true;
    }

    @PreAuthorize("hasAuthority('order:read')")
    public boolean legacy() {
      return true;
    }

    @PreAuthorize("hasAuthority('system:user:list')")
    public boolean helper() {
      return SecurityUtils.hasAuthority("system:user:list");
    }

    @PreAuthorize("hasAuthority('system:user:list')")
    public boolean childThread() throws Exception {
      try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
        return executor.submit(() -> SecurityUtils.hasAuthority("system:user:list")).get();
      }
    }
  }
}
