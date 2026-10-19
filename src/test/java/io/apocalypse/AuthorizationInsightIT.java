package io.apocalypse;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.CacheManager;
import org.springframework.http.HttpMethod;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.assertj.core.api.Assertions.assertThat;

import tools.jackson.databind.JsonNode;

/** 权限全景与反查：授予状态与实时判定同源、闲置/无角色/未分配统计、成员按调用者数据范围可见、范围外计数仅对全局角色编辑开放。 */
class AuthorizationInsightIT extends AbstractIntegrationTest {

  private static final long BASE = 9_097_000_000_000_000L;
  private static final long DEPT_A = BASE + 1;
  private static final long DEPT_B = BASE + 2;
  private static final long R_ACTIVE = BASE + 20;
  private static final long R_PAUSED = BASE + 21;
  private static final long R_FUTURE = BASE + 22;
  private static final long R_EXPIRED = BASE + 23;
  private static final long R_DISABLED = BASE + 24;
  private static final long R_IDLE = BASE + 25;
  private static final long R_OPERATOR = BASE + 26;
  private static final long U_A = BASE + 40;
  private static final long U_B = BASE + 41;
  private static final long U_NONE = BASE + 42;
  private static final long OPERATOR = BASE + 43;
  private static final String PREFIX = "it_insight_";
  private static final String PASSWORD = "InsightFixture2026";

  @Autowired private PasswordEncoder passwordEncoder;
  @Autowired private CacheManager cacheManager;

  private long removePermission;

  @BeforeEach
  void fixtures() {
    cleanup();
    removePermission = permissionId("system:user:remove");
    department(DEPT_A, "a");
    department(DEPT_B, "b");
    role(R_ACTIVE, "active", "ALL", 1);
    role(R_PAUSED, "paused", "DEPT", 1);
    role(R_FUTURE, "future", "DEPT", 1);
    role(R_EXPIRED, "expired", "DEPT", 1);
    role(R_DISABLED, "disabled", "DEPT", 0);
    role(R_IDLE, "idle", "DEPT", 1);
    role(R_OPERATOR, "operator", "DEPT", 1);
    Instant now = Instant.now();
    grant(R_ACTIVE, removePermission, true, null, null);
    grant(R_PAUSED, removePermission, false, null, null);
    grant(R_FUTURE, removePermission, true, now.plus(2, ChronoUnit.DAYS), null);
    grant(R_EXPIRED, removePermission, true, null, now.minus(1, ChronoUnit.DAYS));
    grant(R_DISABLED, removePermission, true, null, null);
    for (String code : List.of("system:role:list", "system:permission:list", "system:user:list")) {
      grant(R_OPERATOR, permissionId(code), true, null, null);
    }
    String hash = passwordEncoder.encode(PASSWORD);
    user(U_A, "member_a", DEPT_A, hash);
    user(U_B, "member_b", DEPT_B, hash);
    user(U_NONE, "no_role", DEPT_A, hash);
    user(OPERATOR, "operator", DEPT_A, hash);
    assign(U_A, R_ACTIVE);
    assign(U_B, R_ACTIVE);
    assign(U_B, R_PAUSED);
    assign(OPERATOR, R_OPERATOR);
    cacheManager.getCache("user").clear();
    cacheManager.getCache("userPerms").clear();
  }

  @AfterEach
  void cleanup() {
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
    jdbcTemplate.update("DELETE FROM sys_dept WHERE id BETWEEN ? AND ?", BASE, BASE + 19);
  }

  @Test
  void holdersReportEveryGrantStateWithTheLiveConditions() {
    String admin = loginAndGetToken("admin", ADMIN_PASSWORD);
    JsonNode holders =
        getForData(
            "/system/authorization/insights/permission-holders?permissionId=" + removePermission,
            admin);

    assertThat(holders.get("code").asText()).isEqualTo("system:user:remove");
    assertThat(holders.get("evaluatedAt").asText()).endsWith("Z");
    assertThat(holders.get("membersVisible").asBoolean()).isTrue();
    assertThat(holders.get("outOfScopeVisible").asBoolean()).isTrue();
    Map<Long, JsonNode> roles = byRole(holders);
    assertThat(roles.get(R_ACTIVE).get("state").asText()).isEqualTo("ACTIVE");
    assertThat(roles.get(R_ACTIVE).get("effectiveScope").asText()).isEqualTo("ALL");
    assertThat(roles.get(R_PAUSED).get("state").asText()).isEqualTo("PAUSED");
    assertThat(roles.get(R_FUTURE).get("state").asText()).isEqualTo("NOT_STARTED");
    assertThat(roles.get(R_EXPIRED).get("state").asText()).isEqualTo("EXPIRED");
    assertThat(roles.get(R_DISABLED).get("state").asText()).isEqualTo("ROLE_DISABLED");
    assertThat(roles).doesNotContainKey(R_IDLE);
    assertThat(names(roles.get(R_ACTIVE).get("members")))
        .contains(PREFIX + "member_a", PREFIX + "member_b");
    // 只有生效角色的成员计入覆盖人数。
    assertThat(holders.get("activeRoleCount").asLong()).isGreaterThanOrEqualTo(1);
  }

  @Test
  void restrictedCallerSeesOnlyMembersInsideItsUserScopeWithoutOutOfScopeCounts() {
    String operator = loginAndGetToken(PREFIX + "operator", PASSWORD);
    JsonNode holders =
        getForData(
            "/system/authorization/insights/permission-holders?permissionId=" + removePermission,
            operator);
    assertThat(holders.get("outOfScopeVisible").asBoolean()).isFalse();
    JsonNode active = byRole(holders).get(R_ACTIVE);
    assertThat(names(active.get("members"))).containsExactly(PREFIX + "member_a");
    assertThat(active.get("visibleMemberCount").asLong()).isEqualTo(1);
    assertThat(active.get("outOfScopeMemberCount").asLong()).isZero();
    assertThat(names(byRole(holders).get(R_PAUSED).get("members"))).isEmpty();

    JsonNode overview = getForData("/system/authorization/insights/overview", operator);
    assertThat(overview.get("usersVisible").asBoolean()).isTrue();
    List<String> withoutRoles = names(overview.get("usersWithoutRoles"));
    assertThat(withoutRoles).contains(PREFIX + "no_role").doesNotContain(PREFIX + "member_b");
  }

  @Test
  void overviewCountsIdleRolesUnassignedNavigationAndScopes() {
    String admin = loginAndGetToken("admin", ADMIN_PASSWORD);
    JsonNode overview = getForData("/system/authorization/insights/overview", admin);

    assertThat(overview.get("roleCount").asLong()).isGreaterThanOrEqualTo(7);
    assertThat(overview.get("permissionCount").asLong()).isPositive();
    assertThat(overview.get("navigationCount").asLong()).isPositive();
    Map<Long, String> idle = new HashMap<>();
    for (JsonNode role : overview.get("idleRoles")) {
      idle.put(role.get("roleId").asLong(), role.get("reason").asText());
    }
    assertThat(idle.get(R_IDLE)).isEqualTo("BOTH");
    assertThat(idle.get(R_FUTURE)).isEqualTo("BOTH");
    assertThat(idle.get(R_PAUSED)).isEqualTo("NO_ACTIVE_GRANTS");
    assertThat(idle).doesNotContainKey(R_ACTIVE);
    assertThat(overview.get("idleRoleCount").asLong()).isGreaterThanOrEqualTo(idle.size());
    assertThat(names(overview.get("usersWithoutRoles"))).contains(PREFIX + "no_role");
    assertThat(overview.get("usersWithoutRolesCount").asLong()).isGreaterThanOrEqualTo(1);
    List<String> scopes = new ArrayList<>();
    overview.get("roleScopeDistribution").forEach(row -> scopes.add(row.get("key").asText()));
    assertThat(scopes).contains("ALL", "DEPT");
    assertThat(overview.get("unassignedNavigation").size()).isLessThanOrEqualTo(50);
    assertThat(overview.get("unassignedNavigationCount").asLong())
        .isGreaterThanOrEqualTo(overview.get("unassignedNavigation").size());
  }

  @Test
  void insightsRequireRoleAndCatalogReadAndRejectUnknownPermission() {
    jdbcTemplate.update(
        "DELETE FROM sys_role_permission WHERE role_id = ? AND permission_id = ?",
        R_OPERATOR,
        permissionId("system:permission:list"));
    String operator = loginAndGetToken(PREFIX + "operator", PASSWORD);
    assertThat(
            exchangeRaw("/system/authorization/insights/overview", HttpMethod.GET, null, operator)
                .get("code")
                .asInt())
        .isEqualTo(40300);
    String admin = loginAndGetToken("admin", ADMIN_PASSWORD);
    assertThat(
            exchangeRaw(
                    "/system/authorization/insights/permission-holders?permissionId=1",
                    HttpMethod.GET,
                    null,
                    admin)
                .get("code")
                .asInt())
        .isEqualTo(40400);
  }

  private long permissionId(String code) {
    return jdbcTemplate.queryForObject(
        "SELECT id FROM sys_permission WHERE code = ?", Long.class, code);
  }

  private void department(long id, String name) {
    jdbcTemplate.update(
        "INSERT INTO sys_dept (id, parent_id, dept_name, sort, status, create_by, update_by) VALUES (?, 0, ?, 99, 1, 'test', 'test')",
        id,
        PREFIX + name);
  }

  private void role(long id, String key, String scope, int status) {
    jdbcTemplate.update(
        "INSERT INTO sys_role (id, role_name, role_key, sort, status, data_scope, create_by, update_by) VALUES (?, ?, ?, 90, ?, ?, 'test', 'test')",
        id,
        PREFIX + key,
        PREFIX + key,
        status,
        scope);
    jdbcTemplate.update(
        "INSERT INTO sys_role_authorization_state(role_id, revision) VALUES (?, 0)", id);
  }

  private void grant(long roleId, long permissionId, boolean enabled, Instant from, Instant until) {
    jdbcTemplate.update(
        "INSERT INTO sys_role_permission (role_id, permission_id, enabled, valid_from, valid_until) VALUES (?, ?, ?, ?, ?)",
        roleId,
        permissionId,
        enabled,
        from == null ? null : Timestamp.from(from),
        until == null ? null : Timestamp.from(until));
  }

  private void user(long id, String name, long dept, String hash) {
    jdbcTemplate.update(
        "INSERT INTO sys_user (id, username, password, nickname, dept_id, status, create_by, update_by) VALUES (?, ?, ?, ?, ?, 1, 'test', 'test')",
        id,
        PREFIX + name,
        hash,
        name,
        dept);
  }

  private void assign(long userId, long roleId) {
    jdbcTemplate.update(
        "INSERT INTO sys_user_role (user_id, role_id) VALUES (?, ?)", userId, roleId);
  }

  private static Map<Long, JsonNode> byRole(JsonNode holders) {
    Map<Long, JsonNode> roles = new HashMap<>();
    holders.get("roles").forEach(role -> roles.put(role.get("roleId").asLong(), role));
    return roles;
  }

  private static List<String> names(JsonNode users) {
    List<String> names = new ArrayList<>();
    users.forEach(user -> names.add(user.get("username").asText()));
    return names;
  }
}
