package io.apocalypse;

import io.apocalypse.system.config.service.ConfigService;

import java.time.Duration;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.http.HttpMethod;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import tools.jackson.databind.JsonNode;

/**
 * system 域基座集成测试：部门树种子结构、字典缓存生命周期（getByType 缓存 + 更新 evict）、 参数按 key 读取与类型化便捷方法、@OperLog
 * 落库与参数脱敏（重点断言：密码值必须为 ***）。
 */
class SystemBaseIT extends AbstractIntegrationTest {

  @Autowired private CacheManager cacheManager;

  @Autowired private ConfigService configService;

  @Test
  void deptTreeReturnsSeedStructure() {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);

    JsonNode tree = getForData("/system/depts/tree", token);

    assertThat(tree.isArray()).isTrue();
    assertThat(tree).hasSize(1);
    JsonNode root = tree.get(0);
    assertThat(root.get("deptName").asText()).isEqualTo("总公司");
    assertThat(root.get("children")).hasSize(2);
    assertThat(root.at("/children/0/deptName").asText()).isEqualTo("研发部");
    assertThat(root.at("/children/1/deptName").asText()).isEqualTo("运营部");
  }

  @Test
  void roleMenusReturnsCurrentAssignmentsForSafeEditing() {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);

    JsonNode menuIds = getForData("/system/roles/1/menus", token);

    assertThat(menuIds.isArray()).isTrue();
    assertThat(menuIds).hasSize(36);
    assertThat(menuIds.toString()).contains("\"100\"").contains("\"144\"").contains("\"165\"");
  }

  @Test
  void hiddenOrderPermissionStaysAuthorizedButDoesNotBecomeNavigation() {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);

    JsonNode currentUser = getForData("/system/users/me", token);

    assertThat(currentUser.get("perms").toString())
        .contains("\"order:create\"")
        .contains("\"order:read:any\"")
        .contains("\"order:list:any\"");
    assertThat(currentUser.get("menus").toString()).doesNotContain("订单权限");
  }

  @Test
  void dictGetByTypeCachedAndEvictedAfterUpdate() {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);

    // 下拉查询：返回种子数据，并写入 dict 缓存
    JsonNode data = getForData("/system/dict/data/type/sys_user_status", token);
    assertThat(data).hasSize(2);
    assertThat(data.get(0).get("dictLabel").asText()).isEqualTo("正常");
    Cache dictCache = cacheManager.getCache("dict");
    assertThat(dictCache).isNotNull();
    assertThat(dictCache.get("sys_user_status")).as("getByType 后应写入缓存").isNotNull();

    // 更新该类型下的一条数据：缓存应被 evict
    putForData(
        "/system/dict/data/1",
        Map.of(
            "dictType", "sys_user_status",
            "dictLabel", "正常",
            "dictValue", "1",
            "sort", 1,
            "remark", "it"),
        token);
    assertThat(dictCache.get("sys_user_status")).as("更新后缓存应被 evict").isNull();

    // 再次查询：缓存重新写入
    getForData("/system/dict/data/type/sys_user_status", token);
    assertThat(dictCache.get("sys_user_status")).isNotNull();
  }

  @Test
  void configGetByKeyAndTypedGetters() {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);

    JsonNode config = getForData("/system/configs/key/demo.site.name", token);
    assertThat(config.get("configValue").asText()).isEqualTo("Apocalypse");

    // 类型化便捷方法（直接调 Service，@Cacheable 同样生效）
    assertThat(configService.get("demo.site.name")).isEqualTo("Apocalypse");
    assertThat(configService.getBool("demo.feature.enabled")).isTrue();
    assertThat(configService.get("not.exists.key")).isNull();
  }

  @Test
  void userCreateOperLogPersistedWithMaskedPassword() {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);

    // 创建用户（@OperLog 生效）：请求体含密码，落库的 oper_param 中密码必须脱敏为 ***
    JsonNode created =
        postForData(
            "/system/users",
            Map.of(
                "username", "maskuser",
                "password", "Mask12345",
                "nickname", "脱敏测试",
                "deptId", 11),
            token);
    assertThat(created.get("deptName").asText()).isEqualTo("研发部");

    await()
        .atMost(Duration.ofSeconds(15))
        .untilAsserted(
            () -> {
              String operParam =
                  jdbcTemplate.queryForObject(
                      "SELECT oper_param FROM sys_oper_log WHERE oper_param LIKE '%maskuser%' LIMIT 1",
                      String.class);
              assertThat(operParam).as("sys_oper_log 应有创建用户记录").isNotNull();
              assertThat(operParam).contains("\"password\":\"***\"");
              assertThat(operParam).doesNotContain("Mask12345");
            });

    // 清理：删除测试用户（逻辑删，不影响其他用例）
    deleteForData("/system/users/" + created.get("id").asText(), token);
  }

  @Test
  void menuRejectsMissingParentAndCycles() {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);
    Map<String, Object> missingParent = menuRequest(999_999_999L, "无效父节点");
    JsonNode missing = exchangeRaw("/system/menus", HttpMethod.POST, missingParent, token);
    assertThat(missing.get("code").asInt()).isEqualTo(40400);

    Long parentId = postForData("/system/menus", menuRequest(0L, "环检测父节点"), token).asLong();
    // 新增菜单会使旧 access token 授权版本失效，重新登录后继续。
    token = loginAndGetToken("admin", ADMIN_PASSWORD);
    Long childId = postForData("/system/menus", menuRequest(parentId, "环检测子节点"), token).asLong();
    token = loginAndGetToken("admin", ADMIN_PASSWORD);

    JsonNode cycle =
        exchangeRaw(
            "/system/menus/" + parentId, HttpMethod.PUT, menuRequest(childId, "环检测父节点"), token);
    assertThat(cycle.get("code").asInt()).isEqualTo(10000);

    // 按子到父顺序清理；每次菜单变更后令牌版本都会变化。
    token = loginAndGetToken("admin", ADMIN_PASSWORD);
    deleteForData("/system/menus/" + childId, token);
    token = loginAndGetToken("admin", ADMIN_PASSWORD);
    deleteForData("/system/menus/" + parentId, token);
  }

  private static Map<String, Object> menuRequest(long parentId, String name) {
    return Map.of(
        "parentId",
        parentId,
        "menuName",
        name,
        "menuType",
        "C",
        "sort",
        99,
        "visible",
        1,
        "status",
        1);
  }
}
