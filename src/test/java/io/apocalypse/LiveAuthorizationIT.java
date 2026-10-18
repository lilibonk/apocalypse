package io.apocalypse;

import io.apocalypse.framework.security.TokenVersionStore;
import io.apocalypse.system.authorization.dto.request.RolePermissionsSaveReq;
import io.apocalypse.system.authorization.service.RoleAuthorizationService;
import io.apocalypse.system.user.dto.request.UserUpdateReq;
import io.apocalypse.system.user.service.UserService;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpMethod;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

/** PostgreSQL/HTTP 实证：窗口自然转换、真实方法复合守卫、锁后身份重判和范围不扩大。 */
@Import(LiveAuthorizationIT.TestConfig.class)
class LiveAuthorizationIT extends AbstractIntegrationTest {
  private static final long BASE = 9_117_000_000_000_000L;
  private static final long DEPARTMENT_ROLE = BASE + 1;
  private static final long WINDOW_ROLE = BASE + 2;
  private static final long TARGET_ROLE = BASE + 3;
  private static final long ACTOR = BASE + 10;
  private static final long TARGET = BASE + 11;
  private static final long OUTSIDE = BASE + 12;
  private static final long PROTECTED = BASE + 13;
  private static final String PREFIX = "live_auth_it_";

  @Autowired private MutableAuthorizationClock clock;
  @Autowired private JwtDecoder decoder;
  @Autowired private PlatformTransactionManager transactionManager;
  @Autowired private RoleAuthorizationService roleAuthorizationService;
  @Autowired private TokenVersionStore tokenVersionStore;
  @Autowired private UserService userService;
  private Instant start;

  @BeforeEach
  void fixtures() {
    cleanup();
    start = Instant.now().truncatedTo(ChronoUnit.MILLIS);
    clock.at.set(start);
    role(DEPARTMENT_ROLE, "department");
    role(WINDOW_ROLE, "window");
    role(TARGET_ROLE, "target");
    user(ACTOR, "actor", 11L);
    user(TARGET, "target", 11L);
    user(OUTSIDE, "outside", 12L);
    user(PROTECTED, "protected", 11L);
    jdbcTemplate.update(
        "INSERT INTO sys_user_role(user_id, role_id) VALUES (?, ?), (?, ?), (?, ?)",
        ACTOR,
        DEPARTMENT_ROLE,
        ACTOR,
        WINDOW_ROLE,
        PROTECTED,
        TARGET_ROLE);
    grant(DEPARTMENT_ROLE, "system:user:list", "INHERIT_ROLE", true, null, null);
    grant(DEPARTMENT_ROLE, "system:user:edit", "INHERIT_ROLE", true, null, null);
  }

  @AfterEach
  void cleanup() {
    SecurityContextHolder.clearContext();
    if (clock != null) clock.at.set(Instant.now());
    jdbcTemplate.update(
        "DELETE FROM sys_user_role WHERE user_id BETWEEN ? AND ? OR role_id BETWEEN ? AND ?",
        BASE,
        BASE + 99,
        BASE,
        BASE + 99);
    jdbcTemplate.update(
        "DELETE FROM sys_role_permission WHERE role_id BETWEEN ? AND ?", BASE, BASE + 99);
    jdbcTemplate.update(
        "DELETE FROM sys_role_navigation WHERE role_id BETWEEN ? AND ?", BASE, BASE + 99);
    jdbcTemplate.update(
        "DELETE FROM sys_role_authorization_state WHERE role_id BETWEEN ? AND ?", BASE, BASE + 99);
    jdbcTemplate.update("DELETE FROM sys_user WHERE id BETWEEN ? AND ?", BASE, BASE + 99);
    jdbcTemplate.update("DELETE FROM sys_role WHERE id BETWEEN ? AND ?", BASE, BASE + 99);
    jdbcTemplate.update(
        "DELETE FROM security_token_version WHERE version_key LIKE ?", "%" + PREFIX + "%");
  }

  @Test
  void sameOldJwtGainsAndLosesPermissionExactlyAtWindowBoundaries() {
    removeGrant(DEPARTMENT_ROLE, "system:user:list");
    grant(
        WINDOW_ROLE,
        "system:user:list",
        "DEPT",
        true,
        start.plusSeconds(10),
        start.plusSeconds(20));
    String token = actorToken();
    assertThat(decoder.decode(token).getClaimAsStringList("authorities"))
        .doesNotContain("system:user:list");
    assertCode("/system/users/page", HttpMethod.GET, null, token, 40300);
    var before = getForData("/system/users/me", token);
    assertThat(before.get("nextTransitionAt").asText()).isEqualTo(start.plusSeconds(10).toString());
    clock.at.set(start.plusSeconds(10));
    assertThat(getForData("/system/users/page", token).get("list").isArray()).isTrue();
    var during = getForData("/system/users/me", token);
    assertThat(during.get("perms").toString()).contains("system:user:list");
    assertThat(during.get("evaluatedAt").asText()).endsWith("Z");
    assertThat(during.get("authorizationSnapshotId").asText()).hasSize(64);
    clock.at.set(start.plusSeconds(20));
    assertCode("/system/users/page", HttpMethod.GET, null, token, 40300);
    assertThat(getForData("/system/users/me", token).get("nextTransitionAt").isNull()).isTrue();
  }

  @Test
  void nonUtcApiWindowsRoundTripThroughTimestamptzAndAuthorizeAtTheirInstants() {
    removeGrant(DEPARTMENT_ROLE, "system:user:list");
    String admin = loginAndGetToken("admin", ADMIN_PASSWORD);
    String path = "/system/roles/" + WINDOW_ROLE + "/permissions";
    var baseline = getForData(path, admin);
    long permission = permissionId("system:user:list");
    Instant from = start.plusSeconds(10);
    Instant until = start.plusSeconds(20);
    putForData(
        path,
        Map.of(
            "expectedRevision", baseline.get("revision").asLong(),
            "expectedCatalogRevision", baseline.get("catalogRevision").asLong(),
            "upsert",
                List.of(
                    Map.of(
                        "permissionId",
                        permission,
                        "enabled",
                        true,
                        "scopeOverride",
                        "DEPT",
                        "validFrom",
                        from.atOffset(ZoneOffset.ofHoursMinutes(5, 30)).toString(),
                        "validUntil",
                        until.atOffset(ZoneOffset.ofHours(-7)).toString())),
            "remove", List.of()),
        admin);

    var stored = getForData(path, loginAndGetToken("admin", ADMIN_PASSWORD)).get("grants");
    assertThat(stored.size()).isEqualTo(1);
    assertThat(stored.get(0).get("validFrom").asText()).isEqualTo(from.toString());
    assertThat(stored.get(0).get("validUntil").asText()).isEqualTo(until.toString());
    assertThat(
            jdbcTemplate
                .queryForObject(
                    "SELECT valid_from FROM sys_role_permission WHERE role_id = ? AND permission_id = ?",
                    OffsetDateTime.class,
                    WINDOW_ROLE,
                    permission)
                .toInstant())
        .isEqualTo(from);
    assertThat(
            jdbcTemplate
                .queryForObject(
                    "SELECT valid_until FROM sys_role_permission WHERE role_id = ? AND permission_id = ?",
                    OffsetDateTime.class,
                    WINDOW_ROLE,
                    permission)
                .toInstant())
        .isEqualTo(until);

    String token = actorToken();
    assertThat(decoder.decode(token).getClaimAsStringList("authorities"))
        .doesNotContain("system:user:list");
    clock.at.set(from.minusMillis(1));
    assertCode("/system/users/page", HttpMethod.GET, null, token, 40300);
    clock.at.set(from);
    assertThat(getForData("/system/users/" + TARGET, token).get("id").asLong()).isEqualTo(TARGET);
    clock.at.set(until.minusMillis(1));
    assertThat(getForData("/system/users/" + TARGET, token).get("id").asLong()).isEqualTo(TARGET);
    clock.at.set(until);
    assertCode("/system/users/page", HttpMethod.GET, null, token, 40300);
  }

  @Test
  void overlappingBoundedWindowsMergeOnlyTheirCurrentlyActiveScopes() {
    long overlapRole = BASE + 4;
    role(overlapRole, "overlap");
    jdbcTemplate.update(
        "INSERT INTO sys_user_role(user_id, role_id) VALUES (?, ?)", ACTOR, overlapRole);
    grant(
        DEPARTMENT_ROLE,
        "system:user:list",
        "DEPT",
        true,
        start.plusSeconds(10),
        start.plusSeconds(40));
    grant(
        WINDOW_ROLE, "system:user:list", "ALL", true, start.plusSeconds(20), start.plusSeconds(30));
    grant(
        overlapRole,
        "system:user:list",
        "DEPT_AND_CHILDREN",
        true,
        start.plusSeconds(25),
        start.plusSeconds(50));
    String token = actorToken();
    assertThat(decoder.decode(token).getClaimAsStringList("authorities"))
        .doesNotContain("system:user:list");

    assertReadWindow(token, 9, false, false, 10L);
    assertReadWindow(token, 10, true, false, 20L);
    assertReadWindow(token, 20, true, true, 25L);
    assertReadWindow(token, 25, true, true, 30L);
    assertReadWindow(token, 30, true, false, 40L);
    assertReadWindow(token, 40, true, false, 50L);
    assertReadWindow(token, 50, false, false, null);
  }

  @Test
  void allScopeExpiresWithoutPermissionSetChangingAndSnapshotReflectsTheChange() {
    grant(
        WINDOW_ROLE, "system:user:list", "ALL", true, start.plusSeconds(10), start.plusSeconds(20));
    String token = actorToken();
    var before = getForData("/system/users/me", token);
    clock.at.set(start.plusSeconds(1));
    assertThat(getForData("/system/users/me", token).get("authorizationSnapshotId"))
        .isEqualTo(before.get("authorizationSnapshotId"));
    clock.at.set(start.plusSeconds(10));
    var wide = getForData("/system/users/me", token);
    assertThat(wide.get("perms")).isEqualTo(before.get("perms"));
    assertThat(wide.get("allScopePerms").toString()).contains("system:user:list");
    assertThat(wide.get("authorizationSnapshotId"))
        .isNotEqualTo(before.get("authorizationSnapshotId"));
    assertThat(getForData("/system/users/" + OUTSIDE, token).get("id").asLong()).isEqualTo(OUTSIDE);
    clock.at.set(start.plusSeconds(20));
    var narrowed = getForData("/system/users/me", token);
    assertThat(narrowed.get("perms")).isEqualTo(wide.get("perms"));
    assertThat(narrowed.get("allScopePerms").toString()).doesNotContain("system:user:list");
    assertThat(narrowed.get("authorizationSnapshotId"))
        .isNotEqualTo(wide.get("authorizationSnapshotId"));
    assertCode("/system/users/" + OUTSIDE, HttpMethod.GET, null, token, 40400);
  }

  @Test
  void liveGrantRemovalCannotBeOverriddenByAuthorityStillPresentInJwt() {
    String token = actorToken();
    assertThat(decoder.decode(token).getClaimAsStringList("authorities"))
        .contains("system:user:list");
    // 固定 JWT 版本以单独证明实时授予是执行真源；正式管理写入另外递增撤销版本。
    removeGrant(DEPARTMENT_ROLE, "system:user:list");
    assertCode("/system/users/page", HttpMethod.GET, null, token, 40300);
  }

  @Test
  void nonOverlappingWindowsNeverSatisfyCompoundAndOrAll() {
    grant(DEPARTMENT_ROLE, "system:user:list", "DEPT", true, null, start.plusSeconds(10));
    grant(DEPARTMENT_ROLE, "system:user:edit", "DEPT", true, start.plusSeconds(10), null);
    String token = actorToken();
    for (Instant at : List.of(start, start.plusSeconds(10), start.plusSeconds(20))) {
      clock.at.set(at);
      assertCode("/__authorization-test/and", HttpMethod.GET, null, token, 40300);
      assertCode("/__authorization-test/all", HttpMethod.GET, null, token, 40300);
      assertThat(getForData("/__authorization-test/any", token).get("allowed").asBoolean())
          .isTrue();
    }
  }

  @Test
  void futurePausedAllGrantProtectsTargetUntilItIsCancelled() {
    grant(
        TARGET_ROLE,
        "system:user:list",
        "ALL",
        false,
        start.plusSeconds(60),
        start.plusSeconds(120));
    String token = actorToken();
    assertCode(
        "/system/users/" + PROTECTED, HttpMethod.PUT, Map.of("nickname", "takeover"), token, 40400);
    assertCode(
        "/system/users/" + PROTECTED + "/password",
        HttpMethod.PUT,
        Map.of("newPassword", "Unauthorized2026"),
        token,
        40400);
    jdbcTemplate.update("UPDATE sys_role SET status = 0 WHERE id = ?", TARGET_ROLE);
    assertCode(
        "/system/users/" + PROTECTED,
        HttpMethod.PUT,
        Map.of("nickname", "still protected"),
        token,
        40400);
    removeGrant(TARGET_ROLE, "system:user:list");
    putForData(
        "/system/users/" + PROTECTED, Map.of("nickname", "ordinary after cancellation"), token);
  }

  @ParameterizedTest
  @ValueSource(booleans = {true, false})
  void windowCancellationAndUserWriteObserveOneCommittedProtectionState(boolean commit)
      throws Exception {
    grant(
        TARGET_ROLE,
        "system:user:list",
        "ALL",
        false,
        start.plusSeconds(60),
        start.plusSeconds(120));
    String actor = actorToken();
    String admin = loginAndGetToken("admin", ADMIN_PASSWORD);
    var baseline = getForData("/system/roles/" + TARGET_ROLE + "/permissions", admin);
    long permission = permissionId("system:user:list");
    var command =
        new RolePermissionsSaveReq(
            baseline.get("revision").asLong(), baseline.get("catalogRevision").asLong(),
            List.of(), List.of(permission));
    var transaction = new TransactionTemplate(transactionManager);
    var cancelled = new CountDownLatch(1);
    var release = new CountDownLatch(1);
    try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
      var cancellation =
          executor.submit(
              () ->
                  transaction.execute(
                      status -> {
                        authenticate(admin);
                        try {
                          roleAuthorizationService.savePermissions(TARGET_ROLE, command);
                          cancelled.countDown();
                          awaitLatch(release);
                          if (!commit) status.setRollbackOnly();
                          return null;
                        } finally {
                          SecurityContextHolder.clearContext();
                        }
                      }));
      try {
        assertThat(cancelled.await(10, TimeUnit.SECONDS)).isTrue();
        assertThat(grantCount(TARGET_ROLE, permission)).isEqualTo(1);
        var modification =
            executor.submit(
                () ->
                    exchangeRaw(
                        "/system/users/" + PROTECTED,
                        HttpMethod.PUT,
                        Map.of("nickname", "must not cross cancellation"),
                        actor));
        awaitBlockedAuthorization();
        assertThat(modification.isDone()).isFalse();
        assertThat(nickname(PROTECTED)).isEqualTo(PREFIX + "protected");
        release.countDown();
        cancellation.get(15, TimeUnit.SECONDS);
        assertThat(modification.get(15, TimeUnit.SECONDS).get("code").asInt())
            .isEqualTo(commit ? 40100 : 40400);
        assertThat(nickname(PROTECTED)).isEqualTo(PREFIX + "protected");
        assertThat(grantCount(TARGET_ROLE, permission)).isEqualTo(commit ? 0 : 1);
        if (commit) {
          putForData(
              "/system/users/" + PROTECTED,
              Map.of("nickname", "new call after committed cancellation"),
              actorToken());
        } else {
          assertCode(
              "/system/users/" + PROTECTED,
              HttpMethod.PUT,
              Map.of("nickname", "rollback retains protection"),
              actor,
              40400);
        }
      } finally {
        release.countDown();
      }
    }
  }

  @Test
  void credentialRevokedWhileWriteWaitsForLockIsRejectedAtNewAuthorizationPoint() throws Exception {
    String token = actorToken();
    var transaction = new TransactionTemplate(transactionManager);
    var locked = new CountDownLatch(1);
    var release = new CountDownLatch(1);
    try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
      var blocker =
          executor.submit(
              () ->
                  transaction.execute(
                      status -> {
                        authorizationLock();
                        locked.countDown();
                        awaitLatch(release);
                        jdbcTemplate.update(
                            """
            INSERT INTO security_token_version(version_key, version_value) VALUES (?, 1)
            ON CONFLICT(version_key) DO UPDATE SET version_value = security_token_version.version_value + 1
            """,
                            "credential:user:" + PREFIX + "actor");
                        return null;
                      }));
      try {
        assertThat(locked.await(10, TimeUnit.SECONDS)).isTrue();
        var request =
            executor.submit(
                () ->
                    exchangeRaw(
                        "/system/users/" + TARGET,
                        HttpMethod.PUT,
                        Map.of("nickname", "must not commit"),
                        token));
        awaitBlockedAuthorization();
        release.countDown();
        blocker.get(15, TimeUnit.SECONDS);
        assertThat(request.get(15, TimeUnit.SECONDS).get("code").asInt()).isEqualTo(40100);
        assertThat(nickname(TARGET)).isEqualTo(PREFIX + "target");
      } finally {
        release.countDown();
      }
    }
  }

  @ParameterizedTest
  @ValueSource(strings = {"disabled", "deleted", "user-authorization"})
  void identityChangedWhileWriteWaitsIsRecheckedBeforeAnyMutation(String change) throws Exception {
    String token = actorToken();
    var transaction = new TransactionTemplate(transactionManager);
    var locked = new CountDownLatch(1);
    var release = new CountDownLatch(1);
    try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
      var blocker =
          executor.submit(
              () ->
                  transaction.execute(
                      status -> {
                        authorizationLock();
                        locked.countDown();
                        awaitLatch(release);
                        switch (change) {
                          // 不递增版本，单独证明写授权点会重查用户状态，而非仅比较 JWT 版本。
                          case "disabled" ->
                              jdbcTemplate.update(
                                  "UPDATE sys_user SET status = 0 WHERE id = ?", ACTOR);
                          case "deleted" ->
                              jdbcTemplate.update(
                                  "UPDATE sys_user SET deleted = 1 WHERE id = ?", ACTOR);
                          case "user-authorization" ->
                              tokenVersionStore.invalidateUserAuthorization(PREFIX + "actor");
                          default -> throw new IllegalArgumentException(change);
                        }
                        return null;
                      }));
      try {
        assertThat(locked.await(10, TimeUnit.SECONDS)).isTrue();
        var request =
            executor.submit(
                () ->
                    exchangeRaw(
                        "/system/users/" + TARGET,
                        HttpMethod.PUT,
                        Map.of("nickname", "must not use stale identity"),
                        token));
        awaitBlockedAuthorization();
        release.countDown();
        blocker.get(15, TimeUnit.SECONDS);
        assertThat(request.get(15, TimeUnit.SECONDS).get("code").asInt()).isEqualTo(40100);
        assertThat(nickname(TARGET)).isEqualTo(PREFIX + "target");
      } finally {
        release.countDown();
      }
    }
  }

  @Test
  void expiryBeforeTheWriteAuthorizationPointRejectsTheWaitingRequest() throws Exception {
    grant(DEPARTMENT_ROLE, "system:user:edit", "DEPT", true, start, start.plusSeconds(10));
    String token = actorToken();
    var transaction = new TransactionTemplate(transactionManager);
    var locked = new CountDownLatch(1);
    var release = new CountDownLatch(1);
    try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
      var blocker =
          executor.submit(
              () ->
                  transaction.execute(
                      status -> {
                        authorizationLock();
                        locked.countDown();
                        awaitLatch(release);
                        return null;
                      }));
      try {
        assertThat(locked.await(10, TimeUnit.SECONDS)).isTrue();
        var request =
            executor.submit(
                () ->
                    exchangeRaw(
                        "/system/users/" + TARGET,
                        HttpMethod.PUT,
                        Map.of("nickname", "expired before admission"),
                        token));
        awaitBlockedAuthorization();
        clock.at.set(start.plusSeconds(10));
        release.countDown();
        blocker.get(15, TimeUnit.SECONDS);
        assertThat(request.get(15, TimeUnit.SECONDS).get("code").asInt()).isEqualTo(40300);
        assertThat(nickname(TARGET)).isEqualTo(PREFIX + "target");
      } finally {
        release.countDown();
      }
    }
  }

  @Test
  void transactionAdmittedBeforeExpiryMayCommitButNewCallsAtExpiryAreDenied() throws Exception {
    grant(DEPARTMENT_ROLE, "system:user:edit", "DEPT", true, start, start.plusSeconds(10));
    String token = actorToken();
    var transaction = new TransactionTemplate(transactionManager);
    var admitted = new CountDownLatch(1);
    var release = new CountDownLatch(1);
    try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
      var write =
          executor.submit(
              () ->
                  transaction.execute(
                      status -> {
                        authenticate(token);
                        try {
                          userService.update(
                              TARGET, new UserUpdateReq("admitted before expiry", null, null));
                          admitted.countDown();
                          awaitLatch(release);
                          return null;
                        } finally {
                          SecurityContextHolder.clearContext();
                        }
                      }));
      try {
        assertThat(admitted.await(10, TimeUnit.SECONDS)).isTrue();
        assertThat(nickname(TARGET)).isEqualTo(PREFIX + "target");
        clock.at.set(start.plusSeconds(10));
        assertCode(
            "/system/users/" + TARGET,
            HttpMethod.PUT,
            Map.of("nickname", "new expired call"),
            token,
            40300);
        assertThat(write.isDone()).isFalse();
        release.countDown();
        write.get(15, TimeUnit.SECONDS);
        assertThat(nickname(TARGET)).isEqualTo("admitted before expiry");
        assertCode(
            "/system/users/" + TARGET,
            HttpMethod.PUT,
            Map.of("nickname", "still expired after commit"),
            token,
            40300);
      } finally {
        release.countDown();
      }
    }
  }

  @Test
  void allScopeStartingWhileWriteWaitsCannotWidenTheOriginalDepartmentScope() throws Exception {
    grant(WINDOW_ROLE, "system:user:edit", "ALL", true, start.plusSeconds(10), null);
    String token = actorToken();
    var transaction = new TransactionTemplate(transactionManager);
    var locked = new CountDownLatch(1);
    var release = new CountDownLatch(1);
    try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
      var blocker =
          executor.submit(
              () ->
                  transaction.execute(
                      status -> {
                        authorizationLock();
                        locked.countDown();
                        awaitLatch(release);
                        return null;
                      }));
      try {
        assertThat(locked.await(10, TimeUnit.SECONDS)).isTrue();
        var request =
            executor.submit(
                () ->
                    exchangeRaw(
                        "/system/users/" + OUTSIDE,
                        HttpMethod.PUT,
                        Map.of("nickname", "must not widen"),
                        token));
        awaitBlockedAuthorization();
        clock.at.set(start.plusSeconds(10));
        release.countDown();
        blocker.get(15, TimeUnit.SECONDS);
        assertThat(request.get(15, TimeUnit.SECONDS).get("code").asInt()).isEqualTo(40400);
        assertThat(nickname(OUTSIDE)).isEqualTo(PREFIX + "outside");
        // 另一个新的调用可以使用此刻已经生效的 ALL。
        putForData("/system/users/" + OUTSIDE, Map.of("nickname", "new authorized call"), token);
      } finally {
        release.countDown();
      }
    }
  }

  private void role(long id, String suffix) {
    jdbcTemplate.update(
        "INSERT INTO sys_role(id, role_name, role_key, data_scope) VALUES (?, ?, ?, 'DEPT')",
        id,
        PREFIX + suffix,
        PREFIX + suffix);
    jdbcTemplate.update(
        "INSERT INTO sys_role_authorization_state(role_id, revision) VALUES (?, 0)", id);
  }

  private void user(long id, String suffix, long department) {
    jdbcTemplate.update(
        "INSERT INTO sys_user(id, username, nickname, password, dept_id) SELECT ?, ?, ?, password, ? FROM sys_user WHERE id = 1",
        id,
        PREFIX + suffix,
        PREFIX + suffix,
        department);
  }

  private void grant(
      long role, String code, String scope, boolean enabled, Instant from, Instant until) {
    jdbcTemplate.update(
        """
        INSERT INTO sys_role_permission(role_id, permission_id, scope_override, enabled, valid_from, valid_until)
        SELECT ?, id, ?, ?, ?, ? FROM sys_permission WHERE code = ?
        ON CONFLICT(role_id, permission_id) DO UPDATE SET scope_override = EXCLUDED.scope_override,
          enabled = EXCLUDED.enabled, valid_from = EXCLUDED.valid_from, valid_until = EXCLUDED.valid_until
        """,
        role,
        scope,
        enabled,
        offset(from),
        offset(until),
        code);
  }

  private void removeGrant(long role, String code) {
    jdbcTemplate.update(
        "DELETE FROM sys_role_permission WHERE role_id = ? AND permission_id = (SELECT id FROM sys_permission WHERE code = ?)",
        role,
        code);
  }

  private String actorToken() {
    return loginAndGetToken(PREFIX + "actor", ADMIN_PASSWORD);
  }

  private void authenticate(String token) {
    SecurityContextHolder.getContext()
        .setAuthentication(new JwtAuthenticationToken(decoder.decode(token), List.of()));
  }

  private long permissionId(String code) {
    return jdbcTemplate.queryForObject(
        "SELECT id FROM sys_permission WHERE code = ?", Long.class, code);
  }

  private int grantCount(long role, long permission) {
    return jdbcTemplate.queryForObject(
        "SELECT count(*) FROM sys_role_permission WHERE role_id = ? AND permission_id = ?",
        Integer.class,
        role,
        permission);
  }

  private void assertReadWindow(
      String token, long second, boolean allowed, boolean all, Long next) {
    clock.at.set(start.plusSeconds(second));
    var me = getForData("/system/users/me", token);
    assertThat(me.get("perms").toString().contains("system:user:list")).isEqualTo(allowed);
    assertThat(me.get("allScopePerms").toString().contains("system:user:list")).isEqualTo(all);
    if (next == null) {
      assertThat(me.get("nextTransitionAt").isNull()).isTrue();
    } else {
      assertThat(me.get("nextTransitionAt").asText()).isEqualTo(start.plusSeconds(next).toString());
    }
    if (allowed) {
      assertThat(getForData("/system/users/" + TARGET, token).get("id").asLong()).isEqualTo(TARGET);
      if (all) {
        assertThat(getForData("/system/users/" + OUTSIDE, token).get("id").asLong())
            .isEqualTo(OUTSIDE);
      } else {
        assertCode("/system/users/" + OUTSIDE, HttpMethod.GET, null, token, 40400);
      }
    } else {
      assertCode("/system/users/page", HttpMethod.GET, null, token, 40300);
    }
  }

  private String nickname(long id) {
    return jdbcTemplate.queryForObject(
        "SELECT nickname FROM sys_user WHERE id = ?", String.class, id);
  }

  private static OffsetDateTime offset(Instant value) {
    return value == null ? null : value.atOffset(ZoneOffset.UTC);
  }

  private void assertCode(String path, HttpMethod method, Object body, String token, int code) {
    assertThat(exchangeRaw(path, method, body, token).get("code").asInt()).as(path).isEqualTo(code);
  }

  private void authorizationLock() {
    jdbcTemplate.queryForObject(
        "SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext('system-data-scope'))) locked",
        Integer.class);
  }

  private void awaitBlockedAuthorization() {
    await()
        .atMost(Duration.ofSeconds(10))
        .untilAsserted(
            () ->
                assertThat(
                        jdbcTemplate.queryForObject(
                            "SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE '%system-data-scope%'",
                            Long.class))
                    .isPositive());
  }

  private static void awaitLatch(CountDownLatch latch) {
    try {
      if (!latch.await(15, TimeUnit.SECONDS))
        throw new IllegalStateException("authorization lock release timed out");
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException(e);
    }
  }

  static class MutableAuthorizationClock extends Clock {
    final AtomicReference<Instant> at = new AtomicReference<>(Instant.now());

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
      return at.get();
    }
  }

  @TestConfiguration(proxyBeanMethods = false)
  static class TestConfig {
    @Bean
    @Primary
    MutableAuthorizationClock testAuthorizationClock() {
      return new MutableAuthorizationClock();
    }

    @Bean
    AuthorizationProbeController authorizationProbeController() {
      return new AuthorizationProbeController();
    }
  }

  @RestController
  static class AuthorizationProbeController {
    @GetMapping("/__authorization-test/and")
    @PreAuthorize("hasAuthority('system:user:list') and hasAuthority('system:user:edit')")
    public Map<String, Boolean> and() {
      return Map.of("allowed", true);
    }

    @GetMapping("/__authorization-test/all")
    @PreAuthorize("hasAllAuthorities('system:user:list', 'system:user:edit')")
    public Map<String, Boolean> all() {
      return Map.of("allowed", true);
    }

    @GetMapping("/__authorization-test/any")
    @PreAuthorize("hasAnyAuthority('system:user:list', 'system:user:edit')")
    public Map<String, Boolean> any() {
      return Map.of("allowed", true);
    }
  }
}
