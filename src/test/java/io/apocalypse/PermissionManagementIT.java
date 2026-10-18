package io.apocalypse;

import io.apocalypse.common.event.AuthorizationChangedEvent;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpMethod;
import org.springframework.transaction.support.TransactionTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import tools.jackson.databind.JsonNode;

/** 新授权协议的完整基线、并发边界、输入限制与可靠审计。 */
class PermissionManagementIT extends AbstractIntegrationTest {
  @Autowired private ApplicationEventPublisher events;
  @Autowired private TransactionTemplate transactionTemplate;

  @Test
  void legacyRoleMenuProtocolAndPermissionMenuWritesAreRejected() {
    int before =
        jdbcTemplate.queryForObject(
            "SELECT count(*) FROM sys_role_menu WHERE role_id=1", Integer.class);
    assertThat(
            exchangeRaw("/system/roles/1/menus", HttpMethod.GET, null, admin())
                .path("code")
                .asInt())
        .isEqualTo(40000);
    assertThat(
            exchangeRaw("/system/roles/1/menus", HttpMethod.PUT, List.of(101L), admin())
                .path("code")
                .asInt())
        .isEqualTo(40000);
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT count(*) FROM sys_role_menu WHERE role_id=1", Integer.class))
        .isEqualTo(before);
    assertThat(
            exchangeRaw(
                    "/system/menus",
                    HttpMethod.POST,
                    Map.of("parentId", 0, "menuName", "unsupported", "menuType", "F"),
                    admin())
                .path("code")
                .asInt())
        .isEqualTo(40000);
    assertThat(
            exchangeRaw(
                    "/system/menus",
                    HttpMethod.POST,
                    Map.of(
                        "parentId",
                        0,
                        "menuName",
                        "unsupported",
                        "menuType",
                        "M",
                        "perms",
                        "system:user:list"),
                    admin())
                .path("code")
                .asInt())
        .isEqualTo(40000);
  }

  @Test
  void grantAndNavigationCommandsShareRevisionAndKeepCompleteConfiguration() {
    Long roleId = createRole("grant");
    Long permissionId = permissionId("system:user:list");
    JsonNode baseline = getForData("/system/roles/" + roleId + "/permissions", admin());
    var grant = new HashMap<String, Object>();
    grant.put("permissionId", permissionId);
    grant.put("enabled", false);
    grant.put("scopeOverride", "DEPT");
    grant.put("validFrom", "2031-01-01T00:00:00Z");
    grant.put("validUntil", "2031-02-01T00:00:00Z");
    Map<String, Object> command =
        Map.of(
            "expectedRevision",
            baseline.path("revision").asText(),
            "expectedCatalogRevision",
            baseline.path("catalogRevision").asText(),
            "upsert",
            List.of(grant),
            "remove",
            List.of());
    putForData("/system/roles/" + roleId + "/permissions", command, admin());
    JsonNode after = getForData("/system/roles/" + roleId + "/permissions", admin());
    assertThat(after.path("grants")).hasSize(1);
    assertThat(after.at("/grants/0/enabled").asBoolean()).isFalse();
    assertThat(after.at("/grants/0/scopeOverride").asText()).isEqualTo("DEPT");
    assertThat(after.at("/grants/0/validFrom").asText()).isEqualTo("2031-01-01T00:00:00Z");
    assertThat(after.at("/grants/0/definition/code").asText()).isEqualTo("system:user:list");
    assertThat(
            exchangeRaw(
                    "/system/roles/" + roleId + "/permissions", HttpMethod.PUT, command, admin())
                .path("code")
                .asInt())
        .isEqualTo(40900);
    assertThat(
            exchangeRaw(
                    "/system/roles/" + roleId + "/navigation",
                    HttpMethod.PUT,
                    Map.of(
                        "expectedRevision",
                        baseline.path("revision").asText(),
                        "addIds",
                        List.of(101L),
                        "removeIds",
                        List.of()),
                    admin())
                .path("code")
                .asInt())
        .isEqualTo(40900);
    putForData(
        "/system/roles/" + roleId + "/navigation",
        Map.of(
            "expectedRevision",
            after.path("revision").asText(),
            "addIds",
            List.of(101L),
            "removeIds",
            List.of()),
        admin());
    JsonNode latest = getForData("/system/roles/" + roleId + "/permissions", admin());
    assertThat(latest.path("grants")).hasSize(1);
    assertThat(latest.path("revision").asLong()).isEqualTo(after.path("revision").asLong() + 1);
    await()
        .atMost(Duration.ofSeconds(15))
        .untilAsserted(
            () -> {
              String json =
                  jdbcTemplate.queryForObject(
                      """
          SELECT after_configuration FROM sys_authorization_audit
          WHERE subject_type='ROLE_PERMISSION' AND subject_id=? ORDER BY occurred_at DESC LIMIT 1
          """,
                      String.class,
                      roleId);
              assertThat(json)
                  .contains("2031-01-01T00:00:00Z")
                  .contains("DEPT")
                  .contains("\"enabled\":false");
            });
    deleteForData("/system/roles/" + roleId, admin());
  }

  @Test
  void unsupportedScopesConflictsAndImmutableDefinitionFieldsAreRejected() {
    Long roleId = createRole("validation");
    JsonNode baseline = getForData("/system/roles/" + roleId + "/permissions", admin());
    Long calendar = permissionId("calendar:event:list");
    assertThat(
            exchangeRaw(
                    "/system/roles/" + roleId + "/permissions",
                    HttpMethod.PUT,
                    Map.of(
                        "expectedRevision", baseline.path("revision").asText(),
                        "expectedCatalogRevision", baseline.path("catalogRevision").asText(),
                        "upsert",
                            List.of(
                                Map.of(
                                    "permissionId",
                                    calendar,
                                    "enabled",
                                    true,
                                    "scopeOverride",
                                    "DEPT")),
                        "remove", List.of()),
                    admin())
                .path("code")
                .asInt())
        .isEqualTo(40000);
    Long userList = permissionId("system:user:list");
    assertThat(
            exchangeRaw(
                    "/system/roles/" + roleId + "/permissions",
                    HttpMethod.PUT,
                    Map.of(
                        "expectedRevision", baseline.path("revision").asText(),
                        "expectedCatalogRevision", baseline.path("catalogRevision").asText(),
                        "upsert",
                            List.of(
                                Map.of(
                                    "permissionId",
                                    userList,
                                    "enabled",
                                    true,
                                    "scopeOverride",
                                    "ALL")),
                        "remove", List.of(userList)),
                    admin())
                .path("code")
                .asInt())
        .isEqualTo(40000);
    JsonNode definition = getForData("/system/permissions/" + userList, admin());
    assertThat(
            exchangeRaw(
                    "/system/permissions/" + userList,
                    HttpMethod.PUT,
                    Map.of(
                        "expectedVersion",
                        definition.path("version").asInt(),
                        "name",
                        definition.path("name").asText(),
                        "description",
                        "invalid identity edit",
                        "status",
                        1,
                        "lifecycle",
                        "ACTIVE",
                        "code",
                        "system:replacement:list"),
                    admin())
                .path("code")
                .asInt())
        .isEqualTo(40000);
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT code FROM sys_permission WHERE id=?", String.class, userList))
        .isEqualTo("system:user:list");
    deleteForData("/system/roles/" + roleId, admin());
  }

  @Test
  void catalogAndRoleChangesInvalidateTheirExplicitEditingBaselines() {
    Long roleId = createRole("versions");
    JsonNode baseline = getForData("/system/roles/" + roleId + "/permissions", admin());
    Long permissionId = permissionId("system:user:list");
    JsonNode original = getForData("/system/permissions/" + permissionId, admin());
    putForData(
        "/system/permissions/" + permissionId,
        Map.of(
            "expectedVersion",
            original.path("version").asInt(),
            "name",
            original.path("name").asText(),
            "description",
            "catalog revision integration",
            "status",
            1,
            "lifecycle",
            "ACTIVE"),
        admin());
    assertThat(
            exchangeRaw(
                    "/system/roles/" + roleId + "/permissions",
                    HttpMethod.PUT,
                    Map.of(
                        "expectedRevision", baseline.path("revision").asText(),
                        "expectedCatalogRevision", baseline.path("catalogRevision").asText(),
                        "upsert",
                            List.of(
                                Map.of(
                                    "permissionId",
                                    permissionId,
                                    "enabled",
                                    true,
                                    "scopeOverride",
                                    "ALL")),
                        "remove", List.of()),
                    admin())
                .path("code")
                .asInt())
        .isEqualTo(40900);
    Map<String, Object> role = new HashMap<>();
    role.put("roleName", "revision changed");
    role.put(
        "roleKey",
        jdbcTemplate.queryForObject(
            "SELECT role_key FROM sys_role WHERE id=?", String.class, roleId));
    role.put("status", 1);
    role.put("dataScope", "ALL");
    assertThat(
            exchangeRaw("/system/roles/" + roleId, HttpMethod.PUT, role, admin())
                .path("code")
                .asInt())
        .isEqualTo(40900);
    role.put("expectedAuthorizationRevision", baseline.path("revision").asText());
    putForData("/system/roles/" + roleId, role, admin());
    assertThat(
            exchangeRaw("/system/roles/" + roleId, HttpMethod.PUT, role, admin())
                .path("code")
                .asInt())
        .isEqualTo(40900);
    JsonNode current = getForData("/system/permissions/" + permissionId, admin());
    Map<String, Object> restore = new HashMap<>();
    restore.put("expectedVersion", current.path("version").asInt());
    restore.put("name", original.path("name").asText());
    restore.put(
        "description",
        original.path("description").isNull() ? null : original.path("description").asText());
    restore.put("status", original.path("status").asInt());
    restore.put("lifecycle", original.path("lifecycle").asText());
    putForData("/system/permissions/" + permissionId, restore, admin());
    deleteForData("/system/roles/" + roleId, admin());
  }

  @Test
  void navigationRemovalDoesNotRemoveBusinessGrantAndUnknownRelationsSurviveOtherEdits() {
    Long roleId = createRole("independence");
    Long legacy = permissionId("order:create");
    jdbcTemplate.update(
        "INSERT INTO sys_role_permission(role_id,permission_id,enabled) VALUES(?,?,false)",
        roleId,
        legacy);
    Long menuId =
        postForData(
                "/system/menus",
                Map.of(
                    "parentId",
                    0,
                    "menuName",
                    "independent navigation",
                    "menuType",
                    "M",
                    "path",
                    "independent"),
                admin())
            .asLong();
    JsonNode baseline = getForData("/system/roles/" + roleId + "/permissions", admin());
    Long permissionId = permissionId("system:user:list");
    putForData(
        "/system/roles/" + roleId + "/permissions",
        Map.of(
            "expectedRevision", baseline.path("revision").asText(),
            "expectedCatalogRevision", baseline.path("catalogRevision").asText(),
            "upsert",
                List.of(
                    Map.of("permissionId", permissionId, "enabled", true, "scopeOverride", "DEPT")),
            "remove", List.of()),
        admin());
    JsonNode navigation = getForData("/system/roles/" + roleId + "/navigation", admin());
    putForData(
        "/system/roles/" + roleId + "/navigation",
        Map.of(
            "expectedRevision",
            navigation.path("revision").asText(),
            "addIds",
            List.of(menuId),
            "removeIds",
            List.of()),
        admin());
    deleteForData("/system/menus/" + menuId, admin());
    JsonNode after = getForData("/system/roles/" + roleId + "/permissions", admin());
    assertThat(after.path("grants")).hasSize(2);
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT enabled FROM sys_role_permission WHERE role_id=? AND permission_id=?",
                Boolean.class,
                roleId,
                permissionId))
        .isTrue();
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT enabled FROM sys_role_permission WHERE role_id=? AND permission_id=?",
                Boolean.class,
                roleId,
                legacy))
        .isFalse();
    putForData(
        "/system/roles/" + roleId + "/permissions",
        Map.of(
            "expectedRevision",
            after.path("revision").asText(),
            "expectedCatalogRevision",
            after.path("catalogRevision").asText(),
            "upsert",
            List.of(),
            "remove",
            List.of(legacy)),
        admin());
    assertThat(getForData("/system/roles/" + roleId + "/permissions", admin()).path("grants"))
        .hasSize(1);
    deleteForData("/system/roles/" + roleId, admin());
  }

  @Test
  void realHttpAuthorizationSurvivesEveryNavigationEditAndGrantChangesKeepNavigationIndependent() {
    Long roleId = createRole("http-navigation");
    String username = "nav-http-" + UUID.randomUUID();
    Long userId =
        postForData(
                "/system/users",
                Map.of("username", username, "password", ADMIN_PASSWORD, "deptId", 11),
                admin())
            .path("id")
            .asLong();
    Long firstParent = createNavigation(0L, "first navigation parent", "C", "first", 1);
    Long secondParent = createNavigation(0L, "second navigation parent", "C", "second", 1);
    Long menuId = createNavigation(firstParent, "independent user page", "M", "users", 1);
    Long permission = permissionId("system:user:list");
    try {
      putForData("/system/users/" + userId + "/roles", List.of(roleId), admin());
      String token = assertIdentityApi(username, userId, 40300);
      assertThat(getForData("/system/users/me", token).path("menus")).isEmpty();

      setSingleBusinessGrant(roleId, permission, true);
      token = assertRefreshedIdentityApi(token, username, userId, 0);
      assertThat(getForData("/system/users/me", token).path("menus"))
          .as("granting an API action must not create navigation")
          .isEmpty();

      JsonNode navigation = getForData("/system/roles/" + roleId + "/navigation", admin());
      putForData(
          "/system/roles/" + roleId + "/navigation",
          Map.of(
              "expectedRevision", navigation.path("revision").asText(),
              "addIds", List.of(firstParent, secondParent, menuId),
              "removeIds", List.of()),
          admin());
      token = assertRefreshedIdentityApi(token, username, userId, 0);
      assertThat(findMenu(getForData("/system/users/me", token).path("menus"), menuId)).isNotNull();

      putForData(
          "/system/menus/" + menuId,
          navigationRequest(firstParent, "renamed navigation", "M", "users", 1),
          admin());
      token = assertRefreshedIdentityApi(token, username, userId, 0);
      assertThat(
              findMenu(getForData("/system/users/me", token).path("menus"), menuId)
                  .path("menuName")
                  .asText())
          .isEqualTo("renamed navigation");

      putForData(
          "/system/menus/" + menuId,
          navigationRequest(secondParent, "renamed navigation", "M", "users", 1),
          admin());
      token = assertRefreshedIdentityApi(token, username, userId, 0);
      assertThat(
              findMenu(getForData("/system/users/me", token).path("menus"), menuId)
                  .path("parentId")
                  .asLong())
          .isEqualTo(secondParent);

      putForData(
          "/system/menus/" + menuId,
          navigationRequest(secondParent, "renamed navigation", "M", "users", 0),
          admin());
      token = assertRefreshedIdentityApi(token, username, userId, 0);
      assertThat(findMenu(getForData("/system/users/me", token).path("menus"), menuId)).isNull();

      deleteForData("/system/menus/" + menuId, admin());
      token = assertRefreshedIdentityApi(token, username, userId, 0);
      JsonNode survivingNavigation = getForData("/system/users/me", token).path("menus");
      assertThat(findMenu(survivingNavigation, menuId)).isNull();
      assertThat(survivingNavigation).hasSize(2);

      setSingleBusinessGrant(roleId, permission, false);
      token = assertRefreshedIdentityApi(token, username, userId, 40300);
      assertThat(getForData("/system/users/me", token).path("menus"))
          .as("revoking an API action must not remove or add navigation")
          .isEqualTo(survivingNavigation);
      setSingleBusinessGrant(roleId, permission, true);
      token = assertRefreshedIdentityApi(token, username, userId, 0);
      assertThat(getForData("/system/users/me", token).path("menus"))
          .as("regranting an API action must not recreate deleted navigation")
          .isEqualTo(survivingNavigation);
    } finally {
      if (jdbcTemplate.queryForObject(
              "SELECT deleted FROM sys_menu WHERE id=?", Integer.class, menuId)
          == 0) {
        deleteForData("/system/menus/" + menuId, admin());
      }
      deleteForData("/system/menus/" + firstParent, admin());
      deleteForData("/system/menus/" + secondParent, admin());
      deleteForData("/system/users/" + userId, admin());
      deleteForData("/system/roles/" + roleId, admin());
    }
  }

  @Test
  void authorizationAuditRetainsFullPayloadAndDeduplicatesRedelivery() {
    UUID eventId = UUID.randomUUID();
    String payload = "{\"configuration\":\"" + "x".repeat(5000) + "\"}";
    var event =
        new AuthorizationChangedEvent(
            eventId,
            LocalDateTime.now(),
            1L,
            "ROLE_PERMISSION",
            1L,
            40L,
            41L,
            "[]",
            payload,
            "a".repeat(64),
            "integration-redelivery");
    transactionTemplate.executeWithoutResult(
        status -> {
          events.publishEvent(event);
          events.publishEvent(event);
        });
    await()
        .atMost(Duration.ofSeconds(15))
        .untilAsserted(
            () -> {
              assertThat(
                      jdbcTemplate.queryForObject(
                          "SELECT count(*) FROM sys_authorization_audit WHERE event_id=?",
                          Integer.class,
                          eventId))
                  .isEqualTo(1);
              assertThat(
                      jdbcTemplate.queryForObject(
                          "SELECT after_configuration FROM sys_authorization_audit WHERE event_id=?",
                          String.class,
                          eventId))
                  .isEqualTo(payload);
            });
  }

  private String admin() {
    return loginAndGetToken("admin", ADMIN_PASSWORD);
  }

  private Long createRole(String purpose) {
    return postForData(
            "/system/roles",
            Map.of(
                "roleName",
                "permission " + purpose,
                "roleKey",
                "permission-" + UUID.randomUUID(),
                "status",
                1,
                "dataScope",
                "DEPT"),
            admin())
        .asLong();
  }

  private Long permissionId(String code) {
    return jdbcTemplate.queryForObject(
        "SELECT id FROM sys_permission WHERE code=?", Long.class, code);
  }

  private Long createNavigation(Long parentId, String name, String type, String path, int visible) {
    return postForData(
            "/system/menus", navigationRequest(parentId, name, type, path, visible), admin())
        .asLong();
  }

  private Map<String, Object> navigationRequest(
      Long parentId, String name, String type, String path, int visible) {
    return Map.of(
        "parentId", parentId,
        "menuName", name,
        "menuType", type,
        "path", path,
        "visible", visible,
        "status", 1);
  }

  private void setSingleBusinessGrant(Long roleId, Long permissionId, boolean granted) {
    JsonNode baseline = getForData("/system/roles/" + roleId + "/permissions", admin());
    putForData(
        "/system/roles/" + roleId + "/permissions",
        Map.of(
            "expectedRevision",
            baseline.path("revision").asText(),
            "expectedCatalogRevision",
            baseline.path("catalogRevision").asText(),
            "upsert",
            granted
                ? List.of(
                    Map.of("permissionId", permissionId, "enabled", true, "scopeOverride", "DEPT"))
                : List.of(),
            "remove",
            granted ? List.of() : List.of(permissionId)),
        admin());
  }

  private String assertRefreshedIdentityApi(
      String previousToken, String username, Long userId, int expectedCode) {
    assertThat(
            exchangeRaw("/system/users/me", HttpMethod.GET, null, previousToken)
                .path("code")
                .asInt())
        .as("navigation and grant changes still honor the existing authorization-version barrier")
        .isEqualTo(40100);
    return assertIdentityApi(username, userId, expectedCode);
  }

  private String assertIdentityApi(String username, Long userId, int expectedCode) {
    String token = loginAndGetToken(username, ADMIN_PASSWORD);
    assertThat(getForData("/system/users/me", token).at("/user/id").asLong()).isEqualTo(userId);
    assertThat(
            exchangeRaw("/system/users/page?page=1&size=20", HttpMethod.GET, null, token)
                .path("code")
                .asInt())
        .as("the same user's real API authorization is independent of navigation")
        .isEqualTo(expectedCode);
    return token;
  }

  private JsonNode findMenu(JsonNode menus, Long id) {
    for (JsonNode menu : menus) {
      if (menu.path("id").asLong() == id) {
        return menu;
      }
      JsonNode child = findMenu(menu.path("children"), id);
      if (child != null) {
        return child;
      }
    }
    return null;
  }
}
