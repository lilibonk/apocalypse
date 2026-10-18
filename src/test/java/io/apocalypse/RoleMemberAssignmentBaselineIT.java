package io.apocalypse;

import io.apocalypse.framework.security.TokenVersionStore;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.LongStream;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.CacheManager;
import org.springframework.http.HttpMethod;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.assertj.core.api.Assertions.assertThat;

import tools.jackson.databind.JsonNode;

/** 完整成员替换基线与写能力同范围；普通成员分页继续遵循独立的 role:list 范围。 */
class RoleMemberAssignmentBaselineIT extends AbstractIntegrationTest {

  private static final long BASE = 9_094_180_000_000_000L;
  private static final long INSIDE = BASE + 1;
  private static final long OUTSIDE = BASE + 2;
  private static final long TARGET = BASE + 100;
  private static final long EMPTY_TARGET = BASE + 101;
  private static final long DELETED_TARGET = BASE + 102;
  private static final long LIST_LIMITED = BASE + 110;
  private static final long EDIT_ALL = BASE + 111;
  private static final long LIST_ALL = BASE + 112;
  private static final long EDIT_LIMITED = BASE + 113;
  private static final long UNRELATED_ALL = BASE + 114;
  private static final long OPERATOR = BASE + 20;
  private static final long READER = BASE + 21;
  private static final long LIMITED_EDITOR = BASE + 22;
  private static final long EDITOR_ONLY = BASE + 23;
  private static final long MEMBER_BASE = BASE + 1_000;
  private static final int MEMBER_COUNT = 205;
  private static final String PREFIX = "it_member_baseline_";
  private static final String PASSWORD = "MemberBaseline2026";

  @Autowired private PasswordEncoder passwordEncoder;

  @Autowired private CacheManager cacheManager;

  @Autowired private TokenVersionStore tokenVersionStore;

  @BeforeEach
  void fixtures() {
    cleanup();
    jdbcTemplate.update(
        "INSERT INTO sys_dept (id, parent_id, dept_name, status) VALUES (?, 0, ?, 1), (?, 0, ?, 1)",
        INSIDE,
        PREFIX + "inside",
        OUTSIDE,
        PREFIX + "outside");
    role(TARGET, "target", "DEPT");
    role(EMPTY_TARGET, "empty", "DEPT");
    role(DELETED_TARGET, "deleted", "DEPT");
    jdbcTemplate.update("UPDATE sys_role SET deleted = 1 WHERE id = ?", DELETED_TARGET);
    role(LIST_LIMITED, "list_limited", "DEPT", "system:role:list");
    role(EDIT_ALL, "edit_all", "ALL", "system:role:edit");
    role(LIST_ALL, "list_all", "ALL", "system:role:list");
    role(EDIT_LIMITED, "edit_limited", "DEPT", "system:role:edit", "system:role:list");
    role(UNRELATED_ALL, "unrelated_all", "ALL", "system:config:list");
    String hash = passwordEncoder.encode(PASSWORD);
    actor(OPERATOR, "operator", hash, LIST_LIMITED, EDIT_ALL);
    actor(READER, "reader", hash, LIST_ALL);
    actor(LIMITED_EDITOR, "limited", hash, EDIT_LIMITED, UNRELATED_ALL);
    actor(EDITOR_ONLY, "editor_only", hash, EDIT_ALL);
    jdbcTemplate.update(
        """
        INSERT INTO sys_user (id, username, password, status, dept_id, deleted)
        SELECT ? + entry, ? || entry::text, '{test-fixture-disabled}',
               CASE WHEN entry = 2 THEN 0 ELSE 1 END,
               CASE WHEN entry = 1 THEN ? WHEN entry = 4 THEN NULL ELSE ? END,
               CASE WHEN entry = 3 THEN 1 ELSE 0 END
        FROM generate_series(1, ?) AS entry
        """,
        MEMBER_BASE,
        PREFIX + "member_",
        INSIDE,
        OUTSIDE,
        MEMBER_COUNT);
    jdbcTemplate.update(
        "INSERT INTO sys_user_role (user_id, role_id) SELECT id, ? FROM sys_user WHERE username LIKE ?",
        TARGET,
        PREFIX + "member_%");
    cacheManager.getCache("user").clear();
    cacheManager.getCache("userPerms").clear();
  }

  @AfterEach
  void cleanup() {
    jdbcTemplate.update(
        "DELETE FROM sys_user_role WHERE role_id BETWEEN ? AND ? OR user_id BETWEEN ? AND ?",
        BASE,
        BASE + 200,
        BASE,
        BASE + 2_000);
    jdbcTemplate.update(
        "DELETE FROM sys_role_permission WHERE role_id BETWEEN ? AND ?", BASE, BASE + 200);
    jdbcTemplate.update(
        "DELETE FROM sys_role_navigation WHERE role_id BETWEEN ? AND ?", BASE, BASE + 200);
    jdbcTemplate.update(
        "DELETE FROM sys_role_authorization_state WHERE role_id BETWEEN ? AND ?", BASE, BASE + 200);
    jdbcTemplate.update("DELETE FROM sys_user WHERE username LIKE ?", PREFIX + "%");
    jdbcTemplate.update("DELETE FROM sys_role WHERE role_key LIKE ?", PREFIX + "%");
    jdbcTemplate.update("DELETE FROM sys_dept WHERE id IN (?, ?)", INSIDE, OUTSIDE);
    jdbcTemplate.update(
        "DELETE FROM security_token_version WHERE version_key LIKE ?", "%" + PREFIX + "%");
  }

  @Test
  void globalEditReadsCompleteIdsWhileRoleListRemainsDepartmentScoped() {
    String token = token("operator");
    JsonNode visible = getForData("/system/roles/" + TARGET + "/users?size=200", token);
    assertThat(visible.get("total").asInt()).isEqualTo(1);
    assertThat(visible.at("/list/0/id").asText()).isEqualTo(Long.toString(MEMBER_BASE + 1));

    var before = tokenVersionStore.current(PREFIX + "operator");
    JsonNode baseline = getForData(baselinePath(TARGET), token);
    List<String> ids = textIds(baseline);
    assertThat(ids)
        .hasSize(MEMBER_COUNT)
        .doesNotHaveDuplicates()
        .containsExactlyElementsOf(
            LongStream.rangeClosed(1, MEMBER_COUNT)
                .mapToObj(offset -> Long.toString(MEMBER_BASE + offset))
                .toList());
    // Disabled, soft-deleted and unassigned-department records remain in the raw relation baseline.
    assertThat(ids)
        .contains(
            Long.toString(MEMBER_BASE + 2),
            Long.toString(MEMBER_BASE + 3),
            Long.toString(MEMBER_BASE + 4));
    assertThat(tokenVersionStore.current(PREFIX + "operator")).isEqualTo(before);
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT count(*) FROM sys_user_role WHERE role_id = ?", Integer.class, TARGET))
        .isEqualTo(MEMBER_COUNT);
  }

  @Test
  void editPermissionAloneCanReadTheBaselineWithoutReceivingProfilePages() {
    String token = token("editor_only");
    assertThat(textIds(getForData(baselinePath(TARGET), token))).hasSize(MEMBER_COUNT);
    assertCode("/system/roles/" + TARGET + "/users", token, 40300);
  }

  @Test
  void readPermissionOrAnUnrelatedGlobalGrantCannotExposeTheBaseline() {
    assertCode(baselinePath(TARGET), token("reader"), 40300);
    String limited = token("limited");
    assertCode(baselinePath(TARGET), limited, 40300);
    assertCode(baselinePath(BASE + 199), limited, 40300);
    assertCode(baselinePath(TARGET), null, 40100);
  }

  @Test
  void currentWriteScopeIsRecheckedBeforeReturningIds() {
    String token = token("operator");
    jdbcTemplate.update("UPDATE sys_role SET data_scope = 'DEPT' WHERE id = ?", EDIT_ALL);
    assertCode(baselinePath(TARGET), token, 40300);
  }

  @Test
  void preservesEmptyAndDisabledRolesButRejectsMissingAndDeletedRoles() {
    String token = token("operator");
    assertThat(textIds(getForData(baselinePath(EMPTY_TARGET), token))).isEmpty();
    jdbcTemplate.update("UPDATE sys_role SET status = 0 WHERE id = ?", TARGET);
    assertThat(textIds(getForData(baselinePath(TARGET), token))).hasSize(MEMBER_COUNT);
    assertCode(baselinePath(BASE + 199), token, 40400);
    assertCode(baselinePath(DELETED_TARGET), token, 40400);
  }

  private void role(long id, String suffix, String scope, String... permissions) {
    jdbcTemplate.update(
        "INSERT INTO sys_role (id, role_name, role_key, data_scope, status) VALUES (?, ?, ?, ?, 1)",
        id,
        PREFIX + suffix,
        PREFIX + suffix,
        scope);
    jdbcTemplate.update(
        "INSERT INTO sys_role_authorization_state(role_id, revision) VALUES (?, 0)", id);
    for (String permission : permissions) {
      jdbcTemplate.update(
          "INSERT INTO sys_role_permission (role_id, permission_id) SELECT ?, id FROM sys_permission WHERE code = ? AND deleted = 0",
          id,
          permission);
    }
  }

  private void actor(long id, String suffix, String hash, long... roles) {
    jdbcTemplate.update(
        "INSERT INTO sys_user (id, username, password, dept_id, status) VALUES (?, ?, ?, ?, 1)",
        id,
        PREFIX + suffix,
        hash,
        INSIDE);
    for (long role : roles) {
      jdbcTemplate.update("INSERT INTO sys_user_role (user_id, role_id) VALUES (?, ?)", id, role);
    }
  }

  private String token(String suffix) {
    return loginAndGetToken(PREFIX + suffix, PASSWORD);
  }

  private void assertCode(String path, String token, int code) {
    assertThat(exchangeRaw(path, HttpMethod.GET, null, token).get("code").asInt()).isEqualTo(code);
  }

  private static String baselinePath(long roleId) {
    return "/system/roles/" + roleId + "/user-ids";
  }

  private static List<String> textIds(JsonNode baseline) {
    assertThat(baseline.isArray()).isTrue();
    List<String> ids = new ArrayList<>();
    baseline.forEach(
        id -> {
          assertThat(id.isString()).as("Long identifiers must be JSON strings").isTrue();
          ids.add(id.asText());
        });
    return ids;
  }
}
