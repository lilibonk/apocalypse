package io.apocalypse;

import io.apocalypse.framework.capability.CapabilityDefinition;
import io.apocalypse.framework.capability.CapabilityRegistry;
import io.apocalypse.system.menu.dto.response.MenuTreeNode;
import io.apocalypse.system.menu.entity.SysMenuEntity;
import io.apocalypse.system.menu.mapper.SysMenuMapper;
import io.apocalypse.system.menu.service.MenuService;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
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
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.BeanPropertyRowMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.mock.env.MockEnvironment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 验证单一 V1 交付基线的独立业务权限、C/M 导航语义，以及“平台 V1.x + 下游业务 V100.x”迁移演进互操作性。 */
class PermissionMigrationIT extends AbstractIntegrationTest {

  @Test
  void unifiedV1BaselineContainsCleanTablesAndExactDeclaredPermissions() {
    inFreshV1Schema(
        jdbc -> {
          assertThat(
                  jdbc.queryForObject("SELECT to_regclass('sys_role_menu') IS NULL", Boolean.class))
              .isTrue();
          assertThat(
                  jdbc.queryForObject(
                      "SELECT to_regclass('sys_permission_migration_source') IS NULL",
                      Boolean.class))
              .isTrue();
          assertThat(
                  jdbc.queryForObject(
                      "SELECT count(*) FROM sys_role_navigation rn JOIN sys_menu m ON m.id=rn.menu_id WHERE m.menu_type='F'",
                      Integer.class))
              .isZero();
          assertThat(
                  jdbc.queryForObject(
                      "SELECT lifecycle FROM sys_permission WHERE code='order:create'",
                      String.class))
              .isEqualTo("LEGACY");
          assertThat(
                  jdbc.queryForObject(
                      "SELECT lifecycle FROM sys_permission WHERE code='system:permission:list'",
                      String.class))
              .isEqualTo("ACTIVE");
          assertThat(
                  jdbc.queryForObject(
                      "SELECT count(*) FROM sys_menu WHERE component='system/permission/index'",
                      Integer.class))
              .isEqualTo(1);
        });
  }

  @Test
  void permissionCatalogueRejectsReservedPrefixesAndInvalidWindowConstraints() {
    inFreshV1Schema(
        jdbc -> {
          assertThatThrownBy(
                  () ->
                      jdbc.update(
                          """
                          INSERT INTO sys_permission
                            (id, code, name, resource, action, status, lifecycle, declaration_source)
                          VALUES (70001, 'ROLE_admin', 'reserved', 'role', 'admin', 1, 'ACTIVE', 'test')
                          """))
              .hasMessageContaining("ck_sys_permission_code");
          assertThatThrownBy(
                  () ->
                      jdbc.update(
                          """
                          INSERT INTO sys_permission
                            (id, code, name, resource, action, status, lifecycle, declaration_source)
                          VALUES (70002, 'SCOPE_read', 'reserved', 'scope', 'read', 1, 'ACTIVE', 'test')
                          """))
              .hasMessageContaining("ck_sys_permission_code");
        });
  }

  @Test
  void platformV1PatchCleanlyAppliesAfterDownstreamBusinessV100Migration(@TempDir Path extraDir)
      throws Exception {
    Path v100 = extraDir.resolve("V100_1__crm_customer.sql");
    Files.writeString(
        v100,
        """
        CREATE TABLE crm_customer (
            id BIGINT PRIMARY KEY,
            name VARCHAR(64) NOT NULL
        );
        """);

    String schema = "permission_" + UUID.randomUUID().toString().replace("-", "");
    String url =
        POSTGRES.getJdbcUrl()
            + (POSTGRES.getJdbcUrl().contains("?") ? "&" : "?")
            + "currentSchema="
            + schema;
    var source = new DriverManagerDataSource(url, POSTGRES.getUsername(), POSTGRES.getPassword());
    try {
      // 1. 下游项目初始化平台 V1 并应用自己的业务迁移 V100_1
      Flyway initial =
          Flyway.configure()
              .dataSource(source)
              .schemas(schema)
              .defaultSchema(schema)
              .locations("classpath:db/migration", "filesystem:" + extraDir)
              .outOfOrder(true)
              .load();
      assertThat(initial.migrate().migrationsExecuted).isEqualTo(2);

      // 2. 上游平台后续发布 V1_1 平台补丁，下游同步后无冲突应用
      Path v1Patch = extraDir.resolve("V1_1__platform_audit_comment.sql");
      Files.writeString(
          v1Patch, "COMMENT ON TABLE sys_permission IS 'Verified V1.1 upstream patch';");

      Flyway upgraded =
          Flyway.configure()
              .dataSource(source)
              .schemas(schema)
              .defaultSchema(schema)
              .locations("classpath:db/migration", "filesystem:" + extraDir)
              .outOfOrder(true)
              .load();
      assertThat(upgraded.migrate().migrationsExecuted).isEqualTo(1);
      upgraded.validate();

      var jdbc = new JdbcTemplate(source);
      assertThat(
              jdbc.queryForList(
                  "SELECT version FROM flyway_schema_history WHERE success AND type = 'SQL' ORDER BY installed_rank",
                  String.class))
          .containsExactly("1", "100.1", "1.1");
    } finally {
      jdbcTemplate.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
    }
  }

  @Test
  void everyRolesNavigationTreeAndRoutesMatchExpectedSemanticsAcrossCapabilities() {
    inFreshV1Schema(
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
              INSERT INTO sys_role_navigation(role_id,menu_id)
              SELECT r.id,m.id FROM sys_role r CROSS JOIN sys_menu m
              WHERE r.id BETWEEN 71001 AND 71003 AND m.menu_type IN ('C', 'M')
              """);
          jdbc.update(
              """
              INSERT INTO sys_role_navigation(role_id,menu_id)
              SELECT 71004,id FROM sys_menu
              WHERE id IN (160,71101,71105,71106,71108) AND menu_type IN ('C', 'M')
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

          Configuration configuration = new Configuration();
          configuration.setMapUnderscoreToCamelCase(true);
          configuration.setEnvironment(
              new Environment("baseline-v1", new JdbcTransactionFactory(), jdbc.getDataSource()));
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
                List<MenuTreeNode> expected =
                    expectedNavigation(jdbc, 800000 + roleId, capabilities(calendar));
                List<MenuTreeNode> actual =
                    canonicalNavigation(production.treeByUserId(800000 + roleId));
                assertThat(actual)
                    .as("all navigation fields: role=%s calendar=%s", roleId, calendar)
                    .isEqualTo(expected);
                assertThat(routes(actual))
                    .as("every effective route: role=%s calendar=%s", roleId, calendar)
                    .isEqualTo(routes(expected));
              }
              List<MenuTreeNode> activeRoutes = production.treeByUserId(800000 + 71001L);
              if (!calendar) {
                assertThat(routes(activeRoutes))
                    .extracting(RouteView::path)
                    .contains("/fixture/child", "/orphan", "/absolute/segment", "/absolute-route")
                    .doesNotContain(
                        "/fixture/hidden",
                        "/fixture/disabled",
                        "/fixture/deleted",
                        "/fixture/unknown/child",
                        "/fixture/optional/child");
              } else {
                assertThat(routes(activeRoutes))
                    .extracting(RouteView::path)
                    .contains("/fixture/optional/child");
              }
              assertThat(production.treeByUserId(800000 + 71002L)).isEmpty();
              assertThat(production.treeByUserId(800000 + 71003L)).isEmpty();
            }
          }
          assertThat(
                  jdbc.queryForObject(
                      "SELECT count(*) FROM sys_role_navigation WHERE role_id=71002 AND menu_id=71103",
                      Integer.class))
              .as("disabled role and disabled navigation relationship remain stored")
              .isEqualTo(1);
        });
  }

  private static List<MenuTreeNode> expectedNavigation(
      JdbcTemplate jdbc, long userId, CapabilityRegistry capabilities) {
    List<SysMenuEntity> menus =
        jdbc.query(
            """
            SELECT DISTINCT m.* FROM sys_menu m
            JOIN sys_role_navigation rm ON m.id=rm.menu_id
            JOIN sys_role r ON rm.role_id=r.id
            JOIN sys_user_role ur ON rm.role_id=ur.role_id
            WHERE ur.user_id=? AND r.deleted=0 AND r.status=1
              AND m.deleted=0 AND m.status=1 AND m.visible=1 AND m.menu_type IN ('C', 'M')
            ORDER BY m.sort
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

  private void inFreshV1Schema(Consumer<JdbcTemplate> test) {
    String schema = "permission_" + UUID.randomUUID().toString().replace("-", "");
    String url =
        POSTGRES.getJdbcUrl()
            + (POSTGRES.getJdbcUrl().contains("?") ? "&" : "?")
            + "currentSchema="
            + schema;
    var source = new DriverManagerDataSource(url, POSTGRES.getUsername(), POSTGRES.getPassword());
    try {
      Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).load().migrate();
      test.accept(new JdbcTemplate(source));
    } finally {
      jdbcTemplate.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
    }
  }
}
