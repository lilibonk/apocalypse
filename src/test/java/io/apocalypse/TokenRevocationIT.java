package io.apocalypse;

import io.apocalypse.framework.capability.CapabilityRegistry;
import io.apocalypse.framework.security.TokenVersionStore;
import io.apocalypse.system.menu.service.MenuService;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.data.redis.core.RedisCallback;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpMethod;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import static org.assertj.core.api.Assertions.assertThat;

import tools.jackson.databind.JsonNode;

/** JWT 版本回归：授权变化使旧 access 失效，凭证变化同时废止 access/refresh。 */
class TokenRevocationIT extends AbstractIntegrationTest {

  @Autowired private StringRedisTemplate redisTemplate;

  @Autowired private TokenVersionStore tokenVersionStore;

  @Autowired private PlatformTransactionManager transactionManager;

  @Autowired private CacheManager cacheManager;

  @Autowired private CapabilityRegistry capabilityRegistry;

  @Autowired private MenuService menuService;

  @Test
  void globalAuthorizationChangeRevokesOldAccessButAllowsRefresh() {
    JsonNode login = login("admin", ADMIN_PASSWORD);
    String oldAccess = login.at("/data/accessToken").asText();
    String oldRefresh = login.at("/data/refreshToken").asText();

    JsonNode roleId =
        postForData(
            "/system/roles",
            Map.of(
                "roleName",
                "全局授权版本测试",
                "roleKey",
                "global_auth_version_test",
                "sort",
                99,
                "status",
                1),
            oldAccess);
    putForData(
        "/system/roles/" + roleId.asText(),
        Map.of(
            "roleName",
            "全局授权版本测试（已更新）",
            "roleKey",
            "global_auth_version_test",
            "sort",
            99,
            "status",
            1),
        oldAccess);

    assertThat(exchangeRaw("/system/users/me", HttpMethod.GET, null, oldAccess).get("code").asInt())
        .isEqualTo(40100);

    JsonNode rotated = refresh(oldRefresh);
    assertThat(rotated.get("code").asInt()).isEqualTo(0);
    String newAccess = rotated.at("/data/accessToken").asText();
    assertThat(getForData("/system/users/me", newAccess).get("user").get("username").asText())
        .isEqualTo("admin");

    deleteForData("/system/roles/" + roleId.asText(), newAccess);
  }

  @Test
  void roleAssignmentAndPasswordResetRevokeExpectedTokens() {
    String adminToken = loginAndGetToken("admin", ADMIN_PASSWORD);
    JsonNode created =
        postForData(
            "/system/users",
            Map.of(
                "username", "token_revocation_user",
                "password", "Token12345",
                "nickname", "令牌撤销测试"),
            adminToken);
    String userId = created.get("id").asText();

    JsonNode login = login("token_revocation_user", "Token12345");
    String oldAccess = login.at("/data/accessToken").asText();
    String oldRefresh = login.at("/data/refreshToken").asText();

    assertThat(menuService.permsByUserId(Long.valueOf(userId))).isEmpty();
    putForData("/system/users/" + userId + "/roles", List.of(1L), adminToken);
    assertThat(menuService.permsByUserId(Long.valueOf(userId))).contains("system:user:list");
    assertThat(exchangeRaw("/system/users/me", HttpMethod.GET, null, oldAccess).get("code").asInt())
        .isEqualTo(40100);

    JsonNode rotated = refresh(oldRefresh);
    assertThat(rotated.get("code").asInt()).isEqualTo(0);
    String newAccess = rotated.at("/data/accessToken").asText();
    String newRefresh = rotated.at("/data/refreshToken").asText();
    assertThat(getForData("/system/users/page?page=1&size=1", newAccess).get("size").asInt())
        .isEqualTo(1);

    putForData(
        "/system/users/" + userId + "/password", Map.of("newPassword", "Token67890"), adminToken);
    flushRedisState();
    assertThat(exchangeRaw("/system/users/me", HttpMethod.GET, null, newAccess).get("code").asInt())
        .isEqualTo(40100);
    assertThat(refresh(newRefresh).get("code").asInt()).isEqualTo(40100);

    deleteForData("/system/users/" + userId, adminToken);
  }

  @Test
  void durableVersionIncrementParticipatesInCallerTransaction() {
    String username = "rollback_probe_" + UUID.randomUUID();
    long before = tokenVersionStore.current(username).credential();
    TransactionTemplate transaction = new TransactionTemplate(transactionManager);

    transaction.executeWithoutResult(
        status -> {
          tokenVersionStore.invalidateCredential(username);
          status.setRollbackOnly();
        });
    assertThat(tokenVersionStore.current(username).credential()).isEqualTo(before);

    transaction.executeWithoutResult(status -> tokenVersionStore.invalidateCredential(username));
    assertThat(tokenVersionStore.current(username).credential()).isEqualTo(before + 1);
  }

  @Test
  void tokenIssuanceBypassesStalePermissionCache() {
    String adminToken = loginAndGetToken("admin", ADMIN_PASSWORD);
    JsonNode created =
        postForData(
            "/system/users",
            Map.of(
                "username", "fresh_permission_user",
                "password", "Fresh12345",
                "nickname", "权限快照测试"),
            adminToken);
    long userId = created.get("id").asLong();
    putForData("/system/users/" + userId + "/roles", List.of(1L), adminToken);

    Cache permissionCache = cacheManager.getCache("userPerms");
    assertThat(permissionCache).isNotNull();
    String permissionKey = userId + ":" + capabilityRegistry.cacheDiscriminator();
    permissionCache.put(permissionKey, List.of());
    assertThat(menuService.permsByUserId(userId)).isEmpty();
    assertThat(menuService.freshPermsByUserId(userId)).contains("system:user:list");

    String userToken = loginAndGetToken("fresh_permission_user", "Fresh12345");
    assertThat(getForData("/system/users/page?page=1&size=1", userToken).get("size").asInt())
        .isEqualTo(1);

    deleteForData("/system/users/" + userId, adminToken);
  }

  @Test
  void disabledRoleDoesNotContributePermissionsToRefreshedToken() {
    String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    String username = "disabled_role_" + suffix;
    String roleKey = "disabled_role_" + suffix;
    String adminToken = loginAndGetToken("admin", ADMIN_PASSWORD);
    JsonNode roleId =
        postForData(
            "/system/roles",
            Map.of("roleName", "禁用角色回归", "roleKey", roleKey, "sort", 99, "status", 1),
            adminToken);
    putForData("/system/roles/" + roleId.asText() + "/menus", List.of(101L), adminToken);
    adminToken = loginAndGetToken("admin", ADMIN_PASSWORD);

    JsonNode user =
        postForData(
            "/system/users",
            Map.of(
                "username", username,
                "password", "DisabledRole2026",
                "nickname", "禁用角色用户"),
            adminToken);
    String userId = user.get("id").asText();
    putForData("/system/users/" + userId + "/roles", List.of(roleId.asLong()), adminToken);

    JsonNode login = login(username, "DisabledRole2026");
    String oldAccess = login.at("/data/accessToken").asText();
    String refresh = login.at("/data/refreshToken").asText();
    assertThat(getForData("/system/users/page?page=1&size=1", oldAccess).get("size").asInt())
        .isEqualTo(1);

    putForData(
        "/system/roles/" + roleId.asText(),
        Map.of("roleName", "禁用角色回归", "roleKey", roleKey, "sort", 99, "status", 0),
        adminToken);
    assertThat(exchangeRaw("/system/users/me", HttpMethod.GET, null, oldAccess).get("code").asInt())
        .isEqualTo(40100);

    JsonNode rotated = refresh(refresh);
    assertThat(rotated.get("code").asInt()).isZero();
    String restrictedAccess = rotated.at("/data/accessToken").asText();
    JsonNode me = getForData("/system/users/me", restrictedAccess);
    assertThat(me.get("roles").isEmpty()).isTrue();
    assertThat(me.get("perms").isEmpty()).isTrue();
    assertThat(me.get("menus").isEmpty()).isTrue();
    assertThat(
            exchangeRaw("/system/users/page?page=1&size=1", HttpMethod.GET, null, restrictedAccess)
                .get("code")
                .asInt())
        .isEqualTo(40300);

    adminToken = loginAndGetToken("admin", ADMIN_PASSWORD);
    putForData(
        "/system/roles/" + roleId.asText(),
        Map.of("roleName", "禁用角色回归", "roleKey", roleKey, "sort", 99, "status", 1),
        adminToken);
    String restoredAccess = loginAndGetToken(username, "DisabledRole2026");
    assertThat(getForData("/system/users/page?page=1&size=1", restoredAccess).get("size").asInt())
        .isEqualTo(1);

    adminToken = loginAndGetToken("admin", ADMIN_PASSWORD);
    deleteForData("/system/users/" + userId, adminToken);
    deleteForData("/system/roles/" + roleId.asText(), adminToken);
  }

  private void flushRedisState() {
    RedisCallback<Void> flushDatabase =
        connection -> {
          connection.serverCommands().flushDb();
          return null;
        };
    redisTemplate.execute(flushDatabase);
  }

  private JsonNode login(String username, String password) {
    JsonNode body =
        exchangeRaw(
            "/auth/login",
            HttpMethod.POST,
            Map.of("username", username, "password", password),
            null);
    assertThat(body.get("code").asInt()).isEqualTo(0);
    return body;
  }

  private JsonNode refresh(String refreshToken) {
    return exchangeRaw(
        "/auth/refresh", HttpMethod.POST, Map.of("refreshToken", refreshToken), null);
  }
}
