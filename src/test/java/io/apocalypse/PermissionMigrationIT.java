package io.apocalypse;

import io.apocalypse.framework.capability.CapabilityDefinition;
import io.apocalypse.framework.capability.CapabilityRegistry;
import io.apocalypse.system.menu.dto.response.MenuTreeNode;
import io.apocalypse.system.menu.entity.SysMenuEntity;
import io.apocalypse.system.menu.mapper.SysMenuMapper;
import io.apocalypse.system.menu.service.MenuService;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.stream.Collectors;

import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.session.Configuration;
import org.apache.ibatis.session.SqlSessionFactoryBuilder;
import org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.BeanPropertyRowMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.mock.env.MockEnvironment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 在独立同构 schema 中真实执行冻结 V1 -> V2，检查每个角色的来源而非只比较数量。 */
class PermissionMigrationIT extends AbstractIntegrationTest {

  @Test
  void preservesExactIdentitiesDormantSourcesAndPerRoleEnabledState() {
    inV1Schema(
        jdbc -> {
          jdbc.update(
              """
          INSERT INTO sys_role(id, role_name, role_key, status, data_scope)
          VALUES (70001, 'enabled', 'migration-enabled', 1, 'DEPT'),
                 (70002, 'disabled', 'migration-disabled', 0, 'ALL')
          """);
          jdbc.update(
              """
          INSERT INTO sys_menu(id, menu_name, menu_type, perms, status, visible)
          VALUES (70001, 'one', 'C', 'migration:exact', 1, 0),
                 (70002, 'two', 'M', 'migration:exact', 0, 1),
                 (70003, 'spaces', 'F', ' migration:exact ', 1, 0),
                 (70004, 'deleted', 'F', 'migration:deleted', 1, 0)
          """);
          jdbc.update("UPDATE sys_menu SET deleted = 1 WHERE id = 70004");
          jdbc.update(
              """
          INSERT INTO sys_role_menu(role_id, menu_id)
          VALUES (70001,70001), (70002,70002), (70001,70003), (70002,70004)
          """);
          var original =
              jdbc.queryForList(
                  """
          SELECT rm.role_id, m.perms AS code, r.data_scope
          FROM sys_role_menu rm JOIN sys_menu m ON m.id = rm.menu_id JOIN sys_role r ON r.id = rm.role_id
          WHERE m.deleted = 0 AND m.status = 1 AND r.deleted = 0 AND r.status = 1
            AND m.perms IS NOT NULL AND m.perms <> ''
          GROUP BY rm.role_id, m.perms, r.data_scope ORDER BY rm.role_id, m.perms
          """);
          migrateLatest(jdbc);
          var migrated =
              jdbc.queryForList(
                  """
          SELECT rp.role_id, p.code, r.data_scope
          FROM sys_role_permission rp JOIN sys_permission p ON p.id = rp.permission_id
          JOIN sys_role r ON r.id = rp.role_id
          WHERE rp.enabled AND p.deleted = 0 AND p.status = 1 AND r.deleted = 0 AND r.status = 1
            AND p.code NOT IN ('system:permission:list','system:permission:edit')
          ORDER BY rp.role_id,p.code
          """);
          assertThat(migrated).isEqualTo(original);
          assertThat(
                  jdbc.queryForObject(
                      "SELECT status FROM sys_permission WHERE code='migration:exact'",
                      Integer.class))
              .isEqualTo(1);
          assertThat(
                  jdbc.queryForObject(
                      "SELECT enabled FROM sys_role_permission WHERE role_id=70002 AND permission_id=70001",
                      Boolean.class))
              .isFalse();
          assertThat(
                  jdbc.queryForObject(
                      "SELECT status FROM sys_permission WHERE code='migration:deleted'",
                      Integer.class))
              .isZero();
          assertThat(
                  jdbc.queryForObject(
                      "SELECT count(*) FROM sys_permission WHERE code=' migration:exact '",
                      Integer.class))
              .isEqualTo(1);
          assertThat(
                  jdbc.queryForObject(
                      "SELECT count(*) FROM sys_role_navigation rn JOIN sys_menu m ON m.id=rn.menu_id WHERE m.menu_type='F'",
                      Integer.class))
              .isZero();
          assertThat(
                  jdbc.queryForObject(
                      "SELECT count(*) FROM sys_role_navigation WHERE role_id=70002 AND menu_id=70002",
                      Integer.class))
              .isEqualTo(1);
          assertThat(
                  jdbc.queryForObject(
                      "SELECT lifecycle FROM sys_permission WHERE code='order:create'",
                      String.class))
              .isEqualTo("LEGACY");
          assertThat(
                  jdbc.queryForObject(
                      "SELECT count(*) FROM sys_permission_migration_source WHERE role_id=70002",
                      Integer.class))
              .isEqualTo(2);
          assertThat(
                  jdbc.queryForObject(
                      "SELECT count(*) FROM sys_permission_migration_source WHERE source_version='V2:management-delegation'",
                      Integer.class))
              .isPositive();
          assertThat(
                  jdbc.queryForObject(
                      "SELECT count(*) FROM sys_menu WHERE component='system/permission/index'",
                      Integer.class))
              .isEqualTo(1);
        });
  }

  @Test
  void conflictingModuleOwnershipStopsTheMigration() {
    inV1Schema(
        jdbc -> {
          jdbc.update(
              """
          INSERT INTO sys_menu(id,menu_name,menu_type,perms,module_key)
          VALUES(70001,'conflict','F','system:user:list','calendar')
          """);
          assertThatThrownBy(() -> migrateLatest(jdbc))
              .hasMessageContaining("conflicting module ownership");
          assertThat(
                  jdbc.queryForObject(
                      "SELECT to_regclass('sys_permission') IS NULL", Boolean.class))
              .isTrue();
        });
  }

  @Test
  void reservedAuthorityIdentityStopsTheMigration() {
    inV1Schema(
        jdbc -> {
          jdbc.update(
              "INSERT INTO sys_menu(id,menu_name,menu_type,perms) VALUES(70001,'reserved','F','ROLE_admin')");
          assertThatThrownBy(() -> migrateLatest(jdbc))
              .hasMessageContaining("reserved authority prefix");
        });
  }

  @Test
  void nonEquivalentMenuManagementEntrypointsRequireReview() {
    inV1Schema(
        jdbc -> {
          jdbc.update(
              """
          INSERT INTO sys_menu(id,parent_id,menu_name,menu_type,path,component)
          VALUES(70001,0,'other','M','other/menu','system/menu/index')
          """);
          assertThatThrownBy(() -> migrateLatest(jdbc))
              .hasMessageContaining("ambiguous menu-management navigation");
        });
  }

  @Test
  void newNavigationPreservesDeletedAndModuleQualifiedEntrypoint() {
    inV1Schema(
        jdbc -> {
          jdbc.update("UPDATE sys_menu SET deleted=1,module_key='fixture',perms=NULL WHERE id=103");
          jdbc.update(
              "INSERT INTO sys_menu(id,menu_name,menu_type,perms) VALUES(70001,'independent list','F','system:menu:list')");
          jdbc.update("INSERT INTO sys_role_menu(role_id,menu_id) VALUES(1,70001)");
          migrateLatest(jdbc);
          var navigation =
              jdbc.queryForMap(
                  "SELECT id,deleted,module_key FROM sys_menu WHERE component='system/permission/index'");
          assertThat(navigation.get("deleted")).isEqualTo(1);
          assertThat(navigation.get("module_key")).isEqualTo("fixture");
          assertThat(
                  jdbc.queryForObject(
                      "SELECT count(*) FROM sys_role_navigation WHERE role_id=1 AND menu_id=?",
                      Integer.class,
                      navigation.get("id")))
              .isEqualTo(1);
          assertThat(
                  jdbc.queryForObject(
                      "SELECT count(*) FROM sys_role_navigation n JOIN sys_menu m ON m.id=n.menu_id WHERE n.role_id=1 AND m.component='system/permission/index' AND m.deleted=0",
                      Integer.class))
              .isZero();
        });
  }

  @Test
  void everyRolesNavigationTreeAndRoutesMatchTheFrozenV1SemanticsAfterMigration() {
    inV1Schema(
        jdbc -> {
          jdbc.update(
              """
              INSERT INTO sys_role(id,role_name,role_key,status,deleted,data_scope)
              VALUES (71001,'route active','route-active',1,0,'DEPT'),
                     (71002,'route disabled','route-disabled',0,0,'ALL'),
                     (71003,'route deleted','route-deleted',1,1,'DEPT_AND_CHILDREN'),
                     (71004,'route partial','route-partial',1,0,'DEPT')
              """);
          jdbc.update(
              """
              INSERT INTO sys_menu
                (id,parent_id,menu_name,menu_type,path,component,perms,module_key,sort,visible,status,deleted)
              VALUES
                (71100,0,'route root','C','/fixture',NULL,'migration:root',NULL,30,1,1,0),
                (71101,71100,'relative route','M','child','system/user/index','migration:leaf',NULL,1,1,1,0),
                (71102,71100,'hidden route','M','hidden','system/user/index','migration:hidden',NULL,2,0,1,0),
                (71103,71100,'disabled route','M','disabled','system/user/index','migration:disabled',NULL,3,1,0,0),
                (71104,71100,'deleted route','M','deleted','system/user/index','migration:deleted',NULL,4,1,1,1),
                (71105,71100,'unknown module','C','unknown',NULL,'migration:unknown','unknown-module',5,1,1,0),
                (71106,71105,'unknown ancestor child','M','child','system/user/index',NULL,NULL,1,1,1,0),
                (71107,71100,'calendar route parent','C','optional',NULL,NULL,'calendar',6,1,1,0),
                (71108,71107,'inherited calendar route','M','child','calendar/index',NULL,NULL,1,1,1,0),
                (71109,71100,'button archive','F',NULL,NULL,'migration:button',NULL,7,1,1,0),
                (71110,0,'disabled parent','C','/disabled-parent',NULL,NULL,NULL,31,1,0,0),
                (71111,71110,'returned orphan','M','orphan','system/user/index',NULL,NULL,1,1,1,0),
                (71112,71100,'root relative route','M','absolute/segment','system/user/index',NULL,NULL,8,1,1,0),
                (71113,71100,'absolute route','M','/absolute-route','system/user/index',NULL,NULL,9,1,1,0)
              """);
          jdbc.update(
              """
              INSERT INTO sys_role_menu(role_id,menu_id)
              SELECT r.id,m.id FROM sys_role r CROSS JOIN sys_menu m
              WHERE r.id BETWEEN 71001 AND 71003
              """);
          jdbc.update(
              """
              INSERT INTO sys_role_menu(role_id,menu_id)
              SELECT 71004,id FROM sys_menu WHERE id IN (160,161,162,163,164,165,71101,71105,71106,71108)
              """);
          List<Long> roles = jdbc.queryForList("SELECT id FROM sys_role ORDER BY id", Long.class);
          for (Long roleId : roles) {
            long userId = 800000 + roleId;
            jdbc.update(
                "INSERT INTO sys_user(id,username,password,dept_id) VALUES(?,?,?,11)",
                userId,
                "migration-route-" + roleId,
                "unused-fixture-password");
            jdbc.update("INSERT INTO sys_user_role(user_id,role_id) VALUES(?,?)", userId, roleId);
          }
          Map<Boolean, Map<Long, List<MenuTreeNode>>> before = new HashMap<>();
          for (boolean calendar : List.of(false, true)) {
            Map<Long, List<MenuTreeNode>> byRole = new HashMap<>();
            for (Long roleId : roles) {
              byRole.put(roleId, frozenV1Navigation(jdbc, 800000 + roleId, capabilities(calendar)));
            }
            before.put(calendar, byRole);
          }
          assertThat(routes(before.get(false).get(71001L)))
              .extracting(RouteView::path)
              .contains("/fixture/child", "/orphan", "/absolute/segment", "/absolute-route")
              .doesNotContain(
                  "/fixture/hidden",
                  "/fixture/disabled",
                  "/fixture/deleted",
                  "/fixture/unknown/child",
                  "/fixture/optional/child");
          assertThat(routes(before.get(true).get(71001L)))
              .extracting(RouteView::path)
              .contains("/fixture/optional/child");
          assertThat(before.get(false).get(71002L)).isEmpty();
          assertThat(before.get(false).get(71003L)).isEmpty();

          migrateLatest(jdbc);
          Configuration configuration = new Configuration();
          configuration.setMapUnderscoreToCamelCase(true);
          configuration.setEnvironment(
              new Environment("migration-v2", new JdbcTransactionFactory(), jdbc.getDataSource()));
          configuration.addMapper(SysMenuMapper.class);
          try (var session = new SqlSessionFactoryBuilder().build(configuration).openSession()) {
            for (boolean calendar : List.of(false, true)) {
              MenuService production =
                  new MenuService(
                      null,
                      session.getMapper(SysMenuMapper.class),
                      null,
                      capabilities(calendar),
                      null,
                      null,
                      null);
              for (Long roleId : roles) {
                List<MenuTreeNode> expected = before.get(calendar).get(roleId);
                List<MenuTreeNode> complete = production.treeByUserId(800000 + roleId);
                assertThat(countComponent(complete, "system/permission/index"))
                    .as("the only added route follows the existing management entry qualification")
                    .isEqualTo(countComponent(expected, "system/menu/index"));
                List<MenuTreeNode> actual = canonicalNavigation(complete);
                assertThat(actual)
                    .as("all existing navigation fields: role=%s calendar=%s", roleId, calendar)
                    .isEqualTo(expected);
                assertThat(routes(actual))
                    .as("every effective route: role=%s calendar=%s", roleId, calendar)
                    .isEqualTo(routes(expected));
              }
            }
          }
          assertThat(
                  jdbc.queryForObject(
                      "SELECT count(*) FROM sys_role_navigation WHERE role_id=71002 AND menu_id=71103",
                      Integer.class))
              .as("disabled role and disabled navigation relationship remain stored")
              .isEqualTo(1);
          assertThat(
                  jdbc.queryForObject(
                      "SELECT lifecycle FROM sys_permission WHERE code='order:create'",
                      String.class))
              .isEqualTo("LEGACY");
          assertThat(
                  jdbc.queryForObject(
                      "SELECT module_key FROM sys_permission WHERE code='migration:unknown'",
                      String.class))
              .isEqualTo("unknown-module");
        });
  }

  /** Frozen V1 query and returned-ancestor rules; F nodes were never frontend navigation routes. */
  private static List<MenuTreeNode> frozenV1Navigation(
      JdbcTemplate jdbc, long userId, CapabilityRegistry capabilities) {
    List<SysMenuEntity> menus =
        jdbc.query(
            """
            SELECT DISTINCT m.* FROM sys_menu m
            JOIN sys_role_menu rm ON m.id=rm.menu_id
            JOIN sys_role r ON rm.role_id=r.id
            JOIN sys_user_role ur ON rm.role_id=ur.role_id
            WHERE ur.user_id=? AND r.deleted=0 AND r.status=1
              AND m.deleted=0 AND m.status=1 AND m.visible=1 ORDER BY m.sort
            """,
            new BeanPropertyRowMapper<>(SysMenuEntity.class),
            userId);
    Map<Long, SysMenuEntity> returned =
        menus.stream().collect(Collectors.toMap(SysMenuEntity::getId, menu -> menu));
    List<SysMenuEntity> enabled =
        menus.stream()
            .filter(
                menu -> {
                  Set<Long> visited = new HashSet<>();
                  SysMenuEntity cursor = menu;
                  while (cursor != null) {
                    if (!capabilities.isEnabled(cursor.getModuleKey())
                        || !visited.add(cursor.getId())) {
                      return false;
                    }
                    cursor = cursor.getParentId() == 0 ? null : returned.get(cursor.getParentId());
                  }
                  return true;
                })
            .toList();
    Set<Long> ids = enabled.stream().map(SysMenuEntity::getId).collect(Collectors.toSet());
    List<MenuTreeNode> roots =
        enabled.stream()
            .filter(menu -> menu.getParentId() == 0 || !ids.contains(menu.getParentId()))
            .map(menu -> legacyNode(menu, enabled))
            .toList();
    return canonicalNavigation(roots);
  }

  private static MenuTreeNode legacyNode(SysMenuEntity menu, List<SysMenuEntity> all) {
    return new MenuTreeNode(
        menu.getId(),
        menu.getParentId(),
        menu.getMenuName(),
        menu.getMenuType(),
        menu.getPath(),
        menu.getComponent(),
        menu.getPerms(),
        menu.getIcon(),
        menu.getModuleKey(),
        menu.getSort(),
        menu.getRemark(),
        all.stream()
            .filter(child -> child.getParentId().equals(menu.getId()))
            .map(child -> legacyNode(child, all))
            .toList(),
        menu.getVisible(),
        menu.getStatus());
  }

  private static List<MenuTreeNode> canonicalNavigation(List<MenuTreeNode> nodes) {
    return nodes.stream()
        .filter(node -> !"F".equals(node.type()))
        // This is the approved new management entry, not an unexplained difference in old routes.
        .filter(node -> !"system/permission/index".equals(node.component()))
        .sorted(Comparator.comparing(MenuTreeNode::sort).thenComparing(MenuTreeNode::id))
        .map(
            node ->
                new MenuTreeNode(
                    node.id(),
                    node.parentId(),
                    node.menuName(),
                    node.type(),
                    node.path(),
                    node.component(),
                    node.perms(),
                    node.icon(),
                    node.moduleKey(),
                    node.sort(),
                    node.remark(),
                    canonicalNavigation(node.children()),
                    node.visible(),
                    node.status()))
        .toList();
  }

  private static CapabilityRegistry capabilities(boolean calendar) {
    return new CapabilityRegistry(
        List.of(new CapabilityDefinition("calendar")),
        new MockEnvironment()
            .withProperty("apocalypse.capabilities.calendar.enabled", Boolean.toString(calendar)));
  }

  private static long countComponent(List<MenuTreeNode> nodes, String component) {
    return nodes.stream()
        .mapToLong(
            node ->
                (component.equals(node.component()) ? 1 : 0)
                    + countComponent(node.children(), component))
        .sum();
  }

  /** Same route contract as flattenMenuRoutes: absolute/multi-segment paths reset the parent. */
  private static List<RouteView> routes(List<MenuTreeNode> nodes) {
    List<RouteView> result = new ArrayList<>();
    appendRoutes(nodes, "", null, result);
    return result;
  }

  private static void appendRoutes(
      List<MenuTreeNode> nodes, String parentPath, String parentModule, List<RouteView> routes) {
    for (MenuTreeNode node : nodes) {
      String raw = node.path();
      String segment = raw == null ? "" : raw.replaceAll("^/+|/+$", "");
      String path =
          segment.isEmpty()
              ? (parentPath.isEmpty() ? "/" : parentPath)
              : raw.startsWith("/") || segment.contains("/")
                  ? "/" + segment
                  : parentPath.isEmpty() ? "/" + segment : parentPath + "/" + segment;
      String module =
          node.moduleKey() == null || node.moduleKey().isEmpty() ? parentModule : node.moduleKey();
      if ("M".equals(node.type()) && raw != null && !raw.isEmpty()) {
        routes.add(new RouteView(path, node.menuName(), node.component(), node.icon(), module));
      }
      appendRoutes(node.children(), path, module, routes);
    }
  }

  private record RouteView(
      String path, String title, String component, String icon, String moduleKey) {}

  private void inV1Schema(Consumer<JdbcTemplate> test) {
    String schema = "permission_" + UUID.randomUUID().toString().replace("-", "");
    String url =
        POSTGRES.getJdbcUrl()
            + (POSTGRES.getJdbcUrl().contains("?") ? "&" : "?")
            + "currentSchema="
            + schema;
    var source = new DriverManagerDataSource(url, POSTGRES.getUsername(), POSTGRES.getPassword());
    try {
      Flyway.configure()
          .dataSource(source)
          .schemas(schema)
          .defaultSchema(schema)
          .target("1")
          .load()
          .migrate();
      test.accept(new JdbcTemplate(source));
    } finally {
      jdbcTemplate.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
    }
  }

  private static void migrateLatest(JdbcTemplate jdbc) {
    Flyway.configure().dataSource(jdbc.getDataSource()).load().migrate();
  }
}
