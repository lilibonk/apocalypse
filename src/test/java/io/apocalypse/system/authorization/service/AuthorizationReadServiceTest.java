package io.apocalypse.system.authorization.service;

import io.apocalypse.calendar.infrastructure.config.CalendarPermissionActions;
import io.apocalypse.framework.capability.CapabilityDefinition;
import io.apocalypse.framework.capability.CapabilityRegistry;
import io.apocalypse.framework.security.PermissionActionRegistry;
import io.apocalypse.system.authorization.dto.response.AuthorizationGrantRow;
import io.apocalypse.system.authorization.mapper.AuthorizationReadMapper;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.security.authentication.BadCredentialsException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AuthorizationReadServiceTest {
  private static final Instant NOW = Instant.parse("2026-10-18T08:00:00Z");
  private AuthorizationReadMapper mapper;
  private AuthorizationReadService service;

  @BeforeEach
  void setup() {
    mapper = mock(AuthorizationReadMapper.class);
    service = service(false);
  }

  @Test
  void onlyActiveSamePermissionGrantsContributeScopeAndBoundaryIsHalfOpen() {
    when(mapper.snapshot(7L))
        .thenReturn(
            List.of(
                row(1, "system:user:list", null, "DEPT", null, null),
                row(2, "system:user:list", null, "ALL", NOW.plusSeconds(10), NOW.plusSeconds(20)),
                row(3, "system:config:list", null, "ALL", null, null)));
    var before = service.read(7L, "alice", NOW);
    assertThat(before.scopes().get("system:user:list").departmentIds()).containsExactly(11L);
    assertThat(before.allScopePerms()).doesNotContain("system:user:list");
    assertThat(before.nextTransitionAt()).isEqualTo(NOW.plusSeconds(10));
    var during = service.read(7L, "alice", NOW.plusSeconds(10));
    assertThat(during.allScopePerms()).contains("system:user:list");
    assertThat(during.nextTransitionAt()).isEqualTo(NOW.plusSeconds(20));
    assertThat(during.permissions()).isEqualTo(before.permissions());
    assertThat(during.snapshotId()).isNotEqualTo(before.snapshotId());
    var after = service.read(7L, "alice", NOW.plusSeconds(20));
    assertThat(after.scopes().get("system:user:list").departmentIds()).containsExactly(11L);
    assertThat(after.nextTransitionAt()).isNull();
  }

  @Test
  void inheritedRoleScopeAndExplicitScopeAreResolvedPerGrant() {
    var inherited = row(1, "system:user:list", null, "INHERIT_ROLE", null, null);
    when(mapper.snapshot(7L))
        .thenReturn(
            List.of(inherited, row(2, "system:user:list", null, "DEPT_AND_CHILDREN", null, null)));
    assertThat(service.read(7L, "alice", NOW).scopes().get("system:user:list").departmentIds())
        .containsExactly(11L, 12L);
  }

  @Test
  void snapshotIdentityDoesNotChangeJustBecauseClockAdvancesWithoutTransition() {
    when(mapper.snapshot(7L))
        .thenReturn(List.of(row(1, "system:user:list", null, "DEPT", null, null)));
    var first = service.read(7L, "alice", NOW);
    var second = service.read(7L, "alice", NOW.plusSeconds(1));
    assertThat(second.snapshotId()).isEqualTo(first.snapshotId());
    assertThat(second.evaluatedAt()).isAfter(first.evaluatedAt());
  }

  @Test
  void disabledOrUnknownCapabilitiesDoNotContributePermissions() {
    when(mapper.snapshot(7L))
        .thenReturn(
            List.of(
                row(1, "calendar:event:list", "calendar", "INHERIT_ROLE", null, null),
                row(2, "system:user:list", "unknown", "INHERIT_ROLE", null, null)));
    assertThat(service.read(7L, "alice", NOW).permissions()).isEmpty();
    assertThat(service(true).read(7L, "alice", NOW).permissions())
        .containsExactly("calendar:event:list");
  }

  @Test
  void calendarCannotAcquireUnimplementedDepartmentScope() {
    when(mapper.snapshot(7L))
        .thenReturn(List.of(row(1, "calendar:event:list", "calendar", "DEPT", null, null)));
    assertThat(service(true).read(7L, "alice", NOW).permissions()).isEmpty();
  }

  @Test
  void legacyIdentityIsProjectedButNeverExecutableAndUnknownActiveIdentityIsDenied() {
    var legacy =
        new AuthorizationGrantRow(
            7L,
            "alice",
            11L,
            "11,12",
            1,
            2,
            3,
            1L,
            "reader",
            "DEPT",
            50L,
            "order:read",
            null,
            "LEGACY",
            "INHERIT_ROLE",
            null,
            null);
    when(mapper.snapshot(7L))
        .thenReturn(List.of(legacy, row(2, "unknown:operation", null, "INHERIT_ROLE", null, null)));
    var snapshot = service.read(7L, "alice", NOW);
    assertThat(snapshot.permissions()).containsExactly("order:read");
    assertThat(snapshot.executablePermissions()).isEmpty();
    assertThat(snapshot.scopes()).isEmpty();
  }

  @Test
  void absentUserOrChangedUsernameCannotProduceAnAuthorizationSnapshot() {
    when(mapper.snapshot(7L)).thenReturn(List.of());
    assertThatThrownBy(() -> service.read(7L, "alice", NOW))
        .isInstanceOf(BadCredentialsException.class);
    when(mapper.snapshot(7L))
        .thenReturn(List.of(row(1, "system:user:list", null, "DEPT", null, null)));
    assertThatThrownBy(() -> service.read(7L, "someone-else", NOW))
        .isInstanceOf(BadCredentialsException.class);
  }

  private AuthorizationReadService service(boolean calendar) {
    var registry =
        new PermissionActionRegistry(
            List.of(SystemPermissionActions.definition(), CalendarPermissionActions.definition()));
    var capabilities =
        new CapabilityRegistry(
            List.of(new CapabilityDefinition("calendar")),
            new MockEnvironment()
                .withProperty(
                    "apocalypse.capabilities.calendar.enabled", Boolean.toString(calendar)));
    return new AuthorizationReadService(
        mapper, registry, capabilities, Clock.fixed(NOW, ZoneOffset.UTC));
  }

  private static AuthorizationGrantRow row(
      long roleId, String code, String module, String override, Instant from, Instant until) {
    return new AuthorizationGrantRow(
        7L,
        "alice",
        11L,
        "11,12",
        1,
        2,
        3,
        roleId,
        "role" + roleId,
        "DEPT",
        roleId + 100,
        code,
        module,
        "ACTIVE",
        override,
        from,
        until);
  }
}
