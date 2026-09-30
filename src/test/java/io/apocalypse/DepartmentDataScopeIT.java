package io.apocalypse;

import io.apocalypse.framework.security.TokenVersionStore;
import io.apocalypse.system.api.UserApi;
import io.apocalypse.system.authorization.dto.response.DataScopeResp;
import io.apocalypse.system.authorization.service.DataScopeService;
import io.apocalypse.system.user.dto.request.UserUpdateReq;
import io.apocalypse.system.user.entity.SysUserEntity;
import io.apocalypse.system.user.mapper.SysUserMapper;
import io.apocalypse.system.user.service.UserService;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.CacheManager;
import org.springframework.http.HttpMethod;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;

import tools.jackson.databind.JsonNode;

/** 真实数据库/HTTP的操作特定角色范围、所有受限写路径、旁路、缓存与并发验收矩阵。 */
class DepartmentDataScopeIT extends AbstractIntegrationTest {
  private static final long BASE = 9_093_000_000_000_000L;
  private static final long ROOT = BASE + 1;
  private static final long CHILD = BASE + 2;
  private static final long SIBLING = BASE + 3;
  private static final long INACTIVE = BASE + 4;
  private static final long BLOCKED_CHILD = BASE + 5;
  private static final long DELETED = BASE + 6;
  private static final long ORPHAN_CHILD = BASE + 7;
  private static final long LIMITED_ROLE = BASE + 20;
  private static final long ALL_ROLE = BASE + 21;
  private static final long UNRELATED_ALL_ROLE = BASE + 22;
  private static final long CHILD_ROLE = BASE + 23;
  private static final long OPERATOR = BASE + 40;
  private static final long SAME_USER = BASE + 41;
  private static final long CHILD_USER = BASE + 42;
  private static final long SIBLING_USER = BASE + 43;
  private static final long NO_DEPT_USER = BASE + 44;
  private static final long PROTECTED_USER = BASE + 45;
  private static final String PREFIX = "it_scope_";
  private static final String PASSWORD = "ScopeFixture2026";

  @Autowired private PasswordEncoder passwordEncoder;
  @Autowired private CacheManager cacheManager;
  @Autowired private TokenVersionStore tokenVersionStore;
  @Autowired private UserService userService;
  @Autowired private UserApi userApi;
  @Autowired private DataScopeService dataScopeService;
  @Autowired private SysUserMapper userMapper;
  @Autowired private PlatformTransactionManager transactionManager;

  @BeforeEach
  void fixtures() {
    cleanup();
    department(ROOT, 0, "root", 1, 0);
    department(CHILD, ROOT, "child", 1, 0);
    department(SIBLING, 0, "sibling", 1, 0);
    department(INACTIVE, ROOT, "inactive", 0, 0);
    department(BLOCKED_CHILD, INACTIVE, "blocked-child", 1, 0);
    department(DELETED, ROOT, "deleted", 1, 1);
    department(ORPHAN_CHILD, DELETED, "orphan-child", 1, 0);
    role(LIMITED_ROLE, "limited", "DEPT");
    role(ALL_ROLE, "all", "ALL");
    role(UNRELATED_ALL_ROLE, "unrelated-all", "ALL");
    role(CHILD_ROLE, "children", "DEPT_AND_CHILDREN");
    for (long roleId : List.of(LIMITED_ROLE, ALL_ROLE, CHILD_ROLE)) {
      jdbcTemplate.update(
          """
          INSERT INTO sys_role_menu (role_id, menu_id)
          SELECT ?, id FROM sys_menu WHERE deleted = 0 AND status = 1
            AND (perms LIKE 'system:user:%' OR perms LIKE 'system:role:%'
              OR perms LIKE 'system:dept:%' OR perms LIKE 'system:menu:%')
          """,
          roleId);
    }
    jdbcTemplate.update(
        """
        INSERT INTO sys_role_menu (role_id, menu_id)
        SELECT ?, id FROM sys_menu WHERE perms = 'system:config:list'
        """,
        UNRELATED_ALL_ROLE);
    String hash = passwordEncoder.encode(PASSWORD);
    user(OPERATOR, "operator", ROOT, hash);
    user(SAME_USER, "same", ROOT, hash);
    user(CHILD_USER, "child", CHILD, hash);
    user(SIBLING_USER, "sibling", SIBLING, hash);
    user(NO_DEPT_USER, "none", null, hash);
    user(PROTECTED_USER, "protected", ROOT, hash);
    assign(OPERATOR, LIMITED_ROLE);
    assign(PROTECTED_USER, UNRELATED_ALL_ROLE);
    // Role membership read must obey the role:list operation scope independently of user:list.
    for (long userId : List.of(SAME_USER, CHILD_USER, SIBLING_USER, NO_DEPT_USER)) {
      assign(userId, CHILD_ROLE);
    }
    cacheManager.getCache("user").clear();
    cacheManager.getCache("userPerms").clear();
  }

  @AfterEach
  void cleanup() {
    SecurityContextHolder.clearContext();
    jdbcTemplate.update(
        "DELETE FROM sys_user_role WHERE user_id IN (SELECT id FROM sys_user WHERE username LIKE ?) OR role_id BETWEEN ? AND ?",
        PREFIX + "%",
        BASE,
        BASE + 99);
    jdbcTemplate.update(
        "DELETE FROM sys_role_menu WHERE role_id IN (SELECT id FROM sys_role WHERE role_key LIKE ?)",
        PREFIX + "%");
    jdbcTemplate.update("DELETE FROM sys_user WHERE username LIKE ?", PREFIX + "%");
    jdbcTemplate.update("DELETE FROM sys_role WHERE role_key LIKE ?", PREFIX + "%");
    jdbcTemplate.update("DELETE FROM sys_dept WHERE id BETWEEN ? AND ?", BASE, BASE + 19);
    jdbcTemplate.update(
        "DELETE FROM security_token_version WHERE version_key LIKE ?", "%" + PREFIX + "%");
  }

  @Test
  void paginationCountAndKeywordOrAreFilteredBeforePagingAndGuessedDetailIsHidden() {
    String token = operatorToken();
    JsonNode page = getForData("/system/users/page?keyword=" + PREFIX + "&size=1", token);
    assertThat(page.get("total").asLong()).isEqualTo(3);
    assertThat(page.get("list")).hasSize(1);
    assertThat(
            ids(
                getForData("/system/users/page?keyword=" + PREFIX + "&size=200", token)
                    .get("list")))
        .containsExactlyInAnyOrder(OPERATOR, SAME_USER, PROTECTED_USER);
    jdbcTemplate.update(
        "UPDATE sys_user SET nickname = ? WHERE id = ?", PREFIX + "keyword-or", SIBLING_USER);
    assertThat(getForData("/system/users/page?keyword=keyword-or", token).get("total").asLong())
        .isZero();
    assertCode("/system/users/" + CHILD_USER, HttpMethod.GET, null, token, 40400);
    assertCode("/system/users/" + SIBLING_USER, HttpMethod.GET, null, token, 40400);
    assertCode("/system/users/" + NO_DEPT_USER, HttpMethod.GET, null, token, 40400);
    assertThat(getForData("/system/users/" + SAME_USER, token).get("id").asLong())
        .isEqualTo(SAME_USER);
  }

  @Test
  void onlyRolesGrantingTheSpecificOperationContributeAndMultiRoleUnionIncludesChildren() {
    assign(OPERATOR, UNRELATED_ALL_ROLE);
    assertThat(
            getForData("/system/users/page?keyword=" + PREFIX, operatorToken())
                .get("total")
                .asLong())
        .isEqualTo(3);
    assign(OPERATOR, CHILD_ROLE);
    assertThat(
            ids(
                getForData("/system/users/page?keyword=" + PREFIX + "&size=200", operatorToken())
                    .get("list")))
        .containsExactlyInAnyOrder(OPERATOR, SAME_USER, CHILD_USER, PROTECTED_USER);
    jdbcTemplate.update(
        "DELETE FROM sys_role_menu WHERE role_id = ? AND menu_id IN (SELECT id FROM sys_menu WHERE perms = 'system:user:list')",
        CHILD_ROLE);
    assertThat(
            getForData("/system/users/page?keyword=" + PREFIX, operatorToken())
                .get("total")
                .asLong())
        .isEqualTo(3);
    jdbcTemplate.update("UPDATE sys_role SET status = 0 WHERE id = ?", UNRELATED_ALL_ROLE);
    jdbcTemplate.update("UPDATE sys_role SET deleted = 1 WHERE id = ?", CHILD_ROLE);
    assertThat(
            getForData("/system/users/page?keyword=" + PREFIX, operatorToken())
                .get("total")
                .asLong())
        .isEqualTo(3);
  }

  @Test
  void disabledAndDeletedAllRolesNeverContributeAndAllGrantIsOperationSpecific() {
    assign(OPERATOR, ALL_ROLE);
    assertThat(
            getForData("/system/users/page?keyword=" + PREFIX, operatorToken())
                .get("total")
                .asLong())
        .isEqualTo(6);
    jdbcTemplate.update("UPDATE sys_role SET status = 0 WHERE id = ?", ALL_ROLE);
    assertThat(
            getForData("/system/users/page?keyword=" + PREFIX, operatorToken())
                .get("total")
                .asLong())
        .isEqualTo(3);
    jdbcTemplate.update("UPDATE sys_role SET status = 1, deleted = 1 WHERE id = ?", ALL_ROLE);
    assertThat(
            getForData("/system/users/page?keyword=" + PREFIX, operatorToken())
                .get("total")
                .asLong())
        .isEqualTo(3);
    jdbcTemplate.update("UPDATE sys_role SET deleted = 0 WHERE id = ?", ALL_ROLE);
    jdbcTemplate.update(
        "DELETE FROM sys_role_menu WHERE role_id = ? AND menu_id IN (SELECT id FROM sys_menu WHERE perms <> 'system:user:edit')",
        ALL_ROLE);
    String token = operatorToken();
    // The ALL user:edit grant allows global authorization management for that operation only.
    putForData("/system/users/" + SAME_USER + "/roles", List.of(ALL_ROLE), token);
    putForData("/system/users/" + SIBLING_USER, Map.of("nickname", "global edit operation"), token);
    assertCode(
        "/system/depts/" + CHILD, HttpMethod.PUT, deptRequest(ROOT, "forbidden", 0), token, 40300);
    assertCode(
        "/system/roles/" + LIMITED_ROLE + "/users",
        HttpMethod.PUT,
        List.of(SAME_USER),
        token,
        40300);
    assertThat(getForData("/system/users/page?keyword=" + PREFIX, token).get("total").asLong())
        .isEqualTo(3);
  }

  @Test
  void ineffectiveDepartmentsReturnNoDataAndIdentityEndpointsRemainAvailable() {
    for (Long departmentId :
        java.util.Arrays.asList(null, INACTIVE, BLOCKED_CHILD, DELETED, ORPHAN_CHILD)) {
      jdbcTemplate.update("UPDATE sys_user SET dept_id = ? WHERE id = ?", departmentId, OPERATOR);
      String token = operatorToken();
      assertThat(getForData("/system/users/page?keyword=" + PREFIX, token).get("total").asLong())
          .isZero();
      assertCode("/system/users/" + SAME_USER, HttpMethod.GET, null, token, 40400);
      assertThat(getForData("/system/users/me", token).at("/user/id").asLong()).isEqualTo(OPERATOR);
      assertThat(userApi.getById(SIBLING_USER).id()).isEqualTo(SIBLING_USER);
      assertThat(userService.findLoginUserByUsername(PREFIX + "operator")).isPresent();
    }
    jdbcTemplate.update("UPDATE sys_role SET status = 0 WHERE id = ?", LIMITED_ROLE);
    assertCode("/system/users/page", HttpMethod.GET, null, operatorToken(), 40300);
  }

  @Test
  void departmentOptionsUseFixedOperationMappingAndExcludeEveryInactiveAncestry() {
    String token = operatorToken();
    assertThat(treeIds(getForData("/system/users/department-options?operation=CREATE", token)))
        .containsExactly(ROOT);
    assertCode(
        "/system/users/department-options?operation=system:user:list",
        HttpMethod.GET,
        null,
        token,
        40000);
    jdbcTemplate.update(
        "DELETE FROM sys_role_menu WHERE role_id = ? AND menu_id IN (SELECT id FROM sys_menu WHERE perms = 'system:user:edit')",
        LIMITED_ROLE);
    token = operatorToken();
    assertCode(
        "/system/users/department-options?operation=UPDATE", HttpMethod.GET, null, token, 40300);
    assertThat(treeIds(getForData("/system/users/department-options?operation=CREATE", token)))
        .containsExactly(ROOT);
    List<Long> allOptions =
        treeIds(getForData("/system/users/department-options?operation=CREATE", adminToken()));
    assertThat(allOptions)
        .contains(ROOT, CHILD, SIBLING)
        .doesNotContain(INACTIVE, BLOCKED_CHILD, DELETED, ORPHAN_CHILD);
  }

  @Test
  void everyUserWriteChecksCurrentTargetAndDestinationWhileNullUpdateKeepsDepartment() {
    String token = operatorToken();
    assertCode(
        "/system/users",
        HttpMethod.POST,
        Map.of("username", PREFIX + "new-missing", "password", PASSWORD),
        token,
        40000);
    assertCode(
        "/system/users",
        HttpMethod.POST,
        Map.of("username", PREFIX + "new-sibling", "password", PASSWORD, "deptId", SIBLING),
        token,
        40400);
    JsonNode created =
        postForData(
            "/system/users",
            Map.of("username", PREFIX + "new-valid", "password", PASSWORD, "deptId", ROOT),
            token);
    assertThat(created.get("deptId").asLong()).isEqualTo(ROOT);
    assertThat(
            putForData("/system/users/" + SAME_USER, Map.of("nickname", "within scope"), token)
                .get("deptId")
                .asLong())
        .isEqualTo(ROOT);
    assertCode(
        "/system/users/" + SAME_USER, HttpMethod.PUT, Map.of("deptId", SIBLING), token, 40400);
    for (long userId : List.of(CHILD_USER, SIBLING_USER, NO_DEPT_USER)) {
      assertCode(
          "/system/users/" + userId, HttpMethod.PUT, Map.of("nickname", "forbidden"), token, 40400);
      assertCode("/system/users/" + userId, HttpMethod.PUT, Map.of("status", 0), token, 40400);
      assertCode(
          "/system/users/" + userId + "/password",
          HttpMethod.PUT,
          Map.of("newPassword", "ScopeChanged2026"),
          token,
          40400);
      assertCode("/system/users/" + userId, HttpMethod.DELETE, null, token, 40400);
    }
    putForData(
        "/system/users/" + SAME_USER + "/password",
        Map.of("newPassword", "ScopeChanged2026"),
        token);
    assertThat(loginAndGetToken(PREFIX + "same", "ScopeChanged2026")).isNotBlank();
    putForData("/system/users/" + SAME_USER, Map.of("status", 0), token);
    deleteForData("/system/users/" + created.get("id").asText(), token);
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT deleted FROM sys_user WHERE id = ?",
                Integer.class,
                created.get("id").asLong()))
        .isEqualTo(1);
  }

  @Test
  void anyEffectiveAllRoleProtectsTargetAndSelfAndUnrelatedAllCannotAuthorizeGlobalWrites() {
    String token = operatorToken();
    for (Object body :
        List.of(Map.of("nickname", "takeover"), Map.of("status", 0), Map.of("deptId", CHILD))) {
      assertCode("/system/users/" + PROTECTED_USER, HttpMethod.PUT, body, token, 40400);
    }
    assertCode(
        "/system/users/" + PROTECTED_USER + "/password",
        HttpMethod.PUT,
        Map.of("newPassword", "Takeover2026"),
        token,
        40400);
    assertCode("/system/users/" + PROTECTED_USER, HttpMethod.DELETE, null, token, 40400);
    assign(OPERATOR, UNRELATED_ALL_ROLE);
    token = operatorToken();
    assertCode(
        "/system/users/" + OPERATOR,
        HttpMethod.PUT,
        Map.of("nickname", "self takeover"),
        token,
        40400);
    assertCode(
        "/system/users/" + SAME_USER + "/roles", HttpMethod.PUT, List.of(ALL_ROLE), token, 40300);
    assertCode(
        "/system/roles/" + LIMITED_ROLE + "/users",
        HttpMethod.PUT,
        List.of(SAME_USER),
        token,
        40300);
    assertCode(
        "/system/roles/" + LIMITED_ROLE + "/menus", HttpMethod.PUT, List.of(101L), token, 40300);
    assertCode(
        "/system/roles",
        HttpMethod.POST,
        Map.of("roleName", "Escalate", "roleKey", PREFIX + "escalate", "dataScope", "ALL"),
        token,
        40300);
    assertCode(
        "/system/roles/" + LIMITED_ROLE,
        HttpMethod.PUT,
        Map.of("roleName", "Escalate", "roleKey", PREFIX + "limited", "dataScope", "ALL"),
        token,
        40300);
    assertCode("/system/roles/" + LIMITED_ROLE, HttpMethod.DELETE, null, token, 40300);
    assertCode("/system/depts", HttpMethod.POST, deptRequest(ROOT, "forbidden", 1), token, 40300);
    assertCode(
        "/system/depts/" + CHILD, HttpMethod.PUT, deptRequest(ROOT, "forbidden", 0), token, 40300);
    assertCode("/system/depts/" + CHILD, HttpMethod.DELETE, null, token, 40300);
    jdbcTemplate.update("UPDATE sys_role SET status = 0 WHERE id = ?", UNRELATED_ALL_ROLE);
    putForData(
        "/system/users/" + PROTECTED_USER,
        Map.of("nickname", "ordinary after role disabled"),
        operatorToken());
  }

  @Test
  void roleMembershipPaginationDoesNotLeakSiblingOrUnassignedUsers() {
    JsonNode page = getForData("/system/roles/" + CHILD_ROLE + "/users?size=1", operatorToken());
    assertThat(page.get("total").asLong()).isEqualTo(1);
    assertThat(ids(page.get("list"))).containsExactly(SAME_USER);
    jdbcTemplate.update(
        "DELETE FROM sys_role_menu WHERE role_id = ? AND menu_id IN (SELECT id FROM sys_menu WHERE perms = 'system:role:list')",
        LIMITED_ROLE);
    jdbcTemplate.update(
        "INSERT INTO sys_role_menu (role_id, menu_id) SELECT ?, id FROM sys_menu WHERE perms = 'system:role:list'",
        UNRELATED_ALL_ROLE);
    assign(OPERATOR, UNRELATED_ALL_ROLE);
    assertThat(
            getForData("/system/roles/" + CHILD_ROLE + "/users?size=200", operatorToken())
                .get("total")
                .asLong())
        .isEqualTo(4);
    assertThat(
            getForData("/system/users/page?keyword=" + PREFIX, operatorToken())
                .get("total")
                .asLong())
        .isEqualTo(3);
  }

  @Test
  void allOperationRoleCanRepairUnassignedUsersAndInvalidTargetsStillFail() {
    String token = adminToken();
    assertThat(getForData("/system/users/" + NO_DEPT_USER, token).get("id").asLong())
        .isEqualTo(NO_DEPT_USER);
    postForData(
        "/system/users", Map.of("username", PREFIX + "all-no-dept", "password", PASSWORD), token);
    putForData("/system/users/" + NO_DEPT_USER, Map.of("deptId", ROOT), token);
    assertCode(
        "/system/users/" + SAME_USER, HttpMethod.PUT, Map.of("deptId", INACTIVE), token, 40400);
    assertCode(
        "/system/users/" + SAME_USER,
        HttpMethod.PUT,
        Map.of("deptId", BLOCKED_CHILD),
        token,
        40400);
    assertCode(
        "/system/users/" + SAME_USER, HttpMethod.PUT, Map.of("deptId", DELETED), token, 40400);
    putForData("/system/users/" + PROTECTED_USER, Map.of("nickname", "global may edit"), token);
  }

  @Test
  void cacheHitNeverBypassesNarrowedScopeAndRoleChangesRevokeOldTokens() {
    jdbcTemplate.update(
        "UPDATE sys_role SET data_scope = 'DEPT_AND_CHILDREN' WHERE id = ?", LIMITED_ROLE);
    String oldToken = operatorToken();
    getForData("/system/users/" + CHILD_USER, oldToken);
    assertThat(cacheManager.getCache("user").get(CHILD_USER)).isNotNull();
    putForData("/system/roles/" + LIMITED_ROLE, roleRequest("limited", "DEPT"), adminToken());
    assertCode("/system/users/" + CHILD_USER, HttpMethod.GET, null, oldToken, 40100);
    assertCode("/system/users/" + CHILD_USER, HttpMethod.GET, null, operatorToken(), 40400);
    assertThat(userApi.getById(CHILD_USER).id()).isEqualTo(CHILD_USER);
    assertThat(getForData("/system/users/" + CHILD_USER, adminToken()).get("id").asLong())
        .isEqualTo(CHILD_USER);
  }

  @Test
  void departmentMovesRevokeUserVersionAndHierarchyChangesRevokeGlobalVersionAndClearCache() {
    String oldOperator = operatorToken();
    long beforeUser = tokenVersionStore.current(PREFIX + "operator").userAuthorization();
    putForData("/system/users/" + OPERATOR, Map.of("deptId", SIBLING), adminToken());
    assertThat(tokenVersionStore.current(PREFIX + "operator").userAuthorization())
        .isEqualTo(beforeUser + 1);
    assertCode("/system/users/page", HttpMethod.GET, null, oldOperator, 40100);
    String movedToken = operatorToken();
    assertThat(
            ids(
                getForData("/system/users/page?keyword=" + PREFIX + "&size=200", movedToken)
                    .get("list")))
        .containsExactlyInAnyOrder(OPERATOR, SIBLING_USER);
    getForData("/system/users/" + SIBLING_USER, movedToken);
    long beforeGlobal = tokenVersionStore.current(PREFIX + "operator").globalAuthorization();
    putForData("/system/depts/" + SIBLING, deptRequest(0L, "sibling", 0), adminToken());
    assertThat(tokenVersionStore.current(PREFIX + "operator").globalAuthorization())
        .isEqualTo(beforeGlobal + 1);
    assertThat(cacheManager.getCache("user").get(SIBLING_USER)).isNull();
    assertCode("/system/users/page", HttpMethod.GET, null, movedToken, 40100);
    assertThat(
            getForData("/system/users/page?keyword=" + PREFIX, operatorToken())
                .get("total")
                .asLong())
        .isZero();
  }

  @Test
  void roleContractDefaultsNewToDeptPreservesOmittedUpdatesAndMigratesExistingToAll() {
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT data_scope FROM sys_role WHERE id = 1", String.class))
        .isEqualTo("ALL");
    long newRole =
        postForData(
                "/system/roles",
                Map.of("roleName", "default", "roleKey", PREFIX + "default"),
                adminToken())
            .asLong();
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT data_scope FROM sys_role WHERE id = ?", String.class, newRole))
        .isEqualTo("DEPT");
    putForData(
        "/system/roles/" + newRole,
        Map.of("roleName", "default", "roleKey", PREFIX + "default", "dataScope", "ALL"),
        adminToken());
    putForData(
        "/system/roles/" + newRole,
        Map.of("roleName", "default", "roleKey", PREFIX + "default", "status", 0),
        adminToken());
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT data_scope FROM sys_role WHERE id = ?", String.class, newRole))
        .isEqualTo("ALL");
    assertCode(
        "/system/roles",
        HttpMethod.POST,
        Map.of("roleName", "invalid", "roleKey", PREFIX + "invalid", "dataScope", "CUSTOM"),
        adminToken(),
        40000);
    assertThatThrownBy(
            () ->
                jdbcTemplate.update(
                    "UPDATE sys_role SET data_scope = 'CUSTOM' WHERE id = ?", newRole))
        .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
  }

  @Test
  void atomicWritePredicateRejectsDepartmentMoveEvenWhenExternalWriterDidNotIncrementVersion() {
    SysUserEntity stale = userMapper.selectById(SAME_USER);
    jdbcTemplate.update("UPDATE sys_user SET dept_id = ? WHERE id = ?", SIBLING, SAME_USER);
    stale.setNickname("must not write");
    assertThat(
            userMapper.updateWithinScope(
                stale, ROOT, stale.getVersion(), new DataScopeResp(false, List.of(ROOT))))
        .isZero();
    assertThat(userMapper.deleteWithinScope(stale, new DataScopeResp(false, List.of(ROOT))))
        .isZero();
    assertThat(userMapper.selectById(SAME_USER).getNickname()).isEqualTo(PREFIX + "same");
  }

  @Test
  void inFlightRestrictedWriteWaitsForCommittedMoveAndThenRejectsOutOfScopeTarget()
      throws Exception {
    CountDownLatch updated = new CountDownLatch(1);
    CountDownLatch release = new CountDownLatch(1);
    String token = operatorToken();
    TransactionTemplate transaction = new TransactionTemplate(transactionManager);
    try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
      var moving =
          executor.submit(
              () ->
                  transaction.execute(
                      status -> {
                        authenticate("admin", 1L);
                        try {
                          userService.update(SAME_USER, new UserUpdateReq(null, null, SIBLING));
                          updated.countDown();
                          awaitLatch(release);
                          return null;
                        } finally {
                          SecurityContextHolder.clearContext();
                        }
                      }));
      try {
        assertThat(updated.await(10, TimeUnit.SECONDS)).isTrue();
        var restricted =
            executor.submit(
                () ->
                    exchangeRaw(
                        "/system/users/" + SAME_USER,
                        HttpMethod.PUT,
                        Map.of("nickname", "must not write"),
                        token));
        await()
            .atMost(Duration.ofSeconds(5))
            .untilAsserted(
                () -> {
                  assertThat(
                          jdbcTemplate.queryForObject(
                              """
              SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND NOT granted
                AND objid = (hashtext('system-data-scope')::bigint & 4294967295)::oid)
              """,
                              Boolean.class))
                      .isTrue();
                  assertThat(restricted.isDone()).isFalse();
                });
        release.countDown();
        moving.get(10, TimeUnit.SECONDS);
        assertThat(restricted.get(10, TimeUnit.SECONDS).get("code").asInt()).isEqualTo(40400);
      } finally {
        release.countDown();
      }
    }
    assertThat(userMapper.selectById(SAME_USER).getDeptId()).isEqualTo(SIBLING);
    assertThat(userMapper.selectById(SAME_USER).getNickname()).isEqualTo(PREFIX + "same");
  }

  private void department(long id, long parent, String name, int status, int deleted) {
    jdbcTemplate.update(
        "INSERT INTO sys_dept (id, parent_id, dept_name, status, deleted) VALUES (?, ?, ?, ?, ?)",
        id,
        parent,
        PREFIX + name,
        status,
        deleted);
  }

  private void role(long id, String name, String scope) {
    jdbcTemplate.update(
        "INSERT INTO sys_role (id, role_name, role_key, data_scope) VALUES (?, ?, ?, ?)",
        id,
        PREFIX + name,
        PREFIX + name,
        scope);
  }

  private void user(long id, String name, Long departmentId, String hash) {
    jdbcTemplate.update(
        "INSERT INTO sys_user (id, username, nickname, password, dept_id) VALUES (?, ?, ?, ?, ?)",
        id,
        PREFIX + name,
        PREFIX + name,
        hash,
        departmentId);
  }

  private void assign(long userId, long roleId) {
    jdbcTemplate.update(
        "INSERT INTO sys_user_role (user_id, role_id) VALUES (?, ?)", userId, roleId);
  }

  private String operatorToken() {
    return loginAndGetToken(PREFIX + "operator", PASSWORD);
  }

  private String adminToken() {
    return loginAndGetToken("admin", ADMIN_PASSWORD);
  }

  private void assertCode(String path, HttpMethod method, Object body, String token, int code) {
    assertThat(exchangeRaw(path, method, body, token).get("code").asInt())
        .as("%s %s", method, path)
        .isEqualTo(code);
  }

  private static List<Long> ids(JsonNode array) {
    List<Long> ids = new ArrayList<>();
    array.forEach(node -> ids.add(node.get("id").asLong()));
    return ids;
  }

  private static List<Long> treeIds(JsonNode tree) {
    List<Long> result = new ArrayList<>();
    tree.forEach(
        node -> {
          result.add(node.get("id").asLong());
          result.addAll(treeIds(node.get("children")));
        });
    return result;
  }

  private static Map<String, Object> roleRequest(String name, String scope) {
    return Map.of(
        "roleName", PREFIX + name, "roleKey", PREFIX + name, "dataScope", scope, "status", 1);
  }

  private static Map<String, Object> deptRequest(long parent, String name, int status) {
    return Map.of("parentId", parent, "deptName", PREFIX + name, "status", status);
  }

  private static void authenticate(String username, long id) {
    Jwt jwt =
        Jwt.withTokenValue("scope-fixture")
            .header("alg", "HS256")
            .subject(username)
            .claim("uid", id)
            .claim("type", "access")
            .build();
    SecurityContextHolder.getContext()
        .setAuthentication(new JwtAuthenticationToken(jwt, List.of()));
  }

  private static void awaitLatch(CountDownLatch latch) {
    try {
      if (!latch.await(15, TimeUnit.SECONDS)) {
        throw new IllegalStateException("transaction release timed out");
      }
    } catch (InterruptedException exception) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException(exception);
    }
  }
}
