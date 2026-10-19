package io.apocalypse.system.authorization.mapper;

import java.time.Instant;
import java.util.List;

import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * 权限全景与反查的只读聚合。只读取独立权限目录、业务授予、角色成员与导航分配；不读取历史菜单授权来源。 用户名单按调用者 {@code system:user:list} 数据范围在 SQL
 * 中过滤，保证计数与名单一致。
 */
public interface AuthorizationInsightMapper {

  record RoleRow(
      Long id, String roleName, String roleKey, int status, String dataScope, long memberCount) {}

  record GrantRow(
      Long roleId,
      Long permissionId,
      boolean enabled,
      String scopeOverride,
      Instant validFrom,
      Instant validUntil,
      int permissionStatus,
      String moduleKey) {}

  record PermissionRow(
      Long id, String code, String name, String moduleKey, int status, String lifecycle) {}

  record MemberRow(Long roleId, Long userId, String username, String nickname, Long deptId) {}

  record UserRow(Long id, String username, String nickname) {}

  record NavigationRow(
      Long id, String menuName, String menuType, Long parentId, String path, String moduleKey) {}

  record CountRow(String key, long count) {}

  @Select(
      """
      SELECT r.id, r.role_name, r.role_key, r.status, r.data_scope,
             (SELECT count(*) FROM sys_user_role ur JOIN sys_user u ON u.id = ur.user_id AND u.deleted = 0
              WHERE ur.role_id = r.id) AS member_count
      FROM sys_role r
      WHERE r.deleted = 0
      ORDER BY r.sort, r.id
      """)
  List<RoleRow> roles();

  @Select(
      """
      SELECT g.role_id, g.permission_id, g.enabled, g.scope_override, g.valid_from, g.valid_until,
             p.status AS permission_status, p.module_key
      FROM sys_role_permission g
      JOIN sys_role r ON r.id = g.role_id AND r.deleted = 0
      JOIN sys_permission p ON p.id = g.permission_id AND p.deleted = 0
      ORDER BY g.role_id, g.permission_id
      """)
  List<GrantRow> grants();

  @Select(
      """
      SELECT g.role_id, g.permission_id, g.enabled, g.scope_override, g.valid_from, g.valid_until,
             p.status AS permission_status, p.module_key
      FROM sys_role_permission g
      JOIN sys_role r ON r.id = g.role_id AND r.deleted = 0
      JOIN sys_permission p ON p.id = g.permission_id AND p.deleted = 0
      WHERE g.permission_id = #{permissionId}
      ORDER BY r.sort, r.id
      """)
  List<GrantRow> grantsOf(@Param("permissionId") Long permissionId);

  @Select(
      """
      SELECT id, code, name, module_key, status, lifecycle
      FROM sys_permission WHERE id = #{id} AND deleted = 0
      """)
  PermissionRow permission(@Param("id") Long id);

  @Select(
      "SELECT module_key AS key, count(*) AS count FROM sys_permission WHERE deleted = 0 GROUP BY module_key ORDER BY module_key NULLS FIRST")
  List<CountRow> permissionModules();

  @Select("SELECT count(*) FROM sys_permission WHERE deleted = 0")
  long permissionCount();

  @Select(
      """
      SELECT ur.role_id, u.id AS user_id, u.username, u.nickname, u.dept_id
      FROM sys_user_role ur
      JOIN sys_user u ON u.id = ur.user_id AND u.deleted = 0
      WHERE ur.role_id IN (SELECT role_id FROM sys_role_permission WHERE permission_id = #{permissionId})
      ORDER BY ur.role_id, u.id
      """)
  List<MemberRow> membersOfPermission(@Param("permissionId") Long permissionId);

  @Select(
      """
      <script>
      SELECT count(*) FROM sys_user u
      WHERE u.deleted = 0
      <if test="!all">
        AND u.dept_id IN
        <foreach collection="deptIds" item="d" open="(" separator="," close=")">#{d}</foreach>
      </if>
      </script>
      """)
  long scopedUserCount(@Param("all") boolean all, @Param("deptIds") List<Long> deptIds);

  @Select(
      """
      <script>
      SELECT u.id, u.username, u.nickname FROM sys_user u
      WHERE u.deleted = 0
        AND NOT EXISTS (SELECT 1 FROM sys_user_role ur JOIN sys_role r ON r.id = ur.role_id AND r.deleted = 0
                        WHERE ur.user_id = u.id)
      <if test="!all">
        AND u.dept_id IN
        <foreach collection="deptIds" item="d" open="(" separator="," close=")">#{d}</foreach>
      </if>
      ORDER BY u.id
      LIMIT #{limit}
      </script>
      """)
  List<UserRow> usersWithoutRoles(
      @Param("all") boolean all, @Param("deptIds") List<Long> deptIds, @Param("limit") int limit);

  @Select(
      """
      <script>
      SELECT count(*) FROM sys_user u
      WHERE u.deleted = 0
        AND NOT EXISTS (SELECT 1 FROM sys_user_role ur JOIN sys_role r ON r.id = ur.role_id AND r.deleted = 0
                        WHERE ur.user_id = u.id)
      <if test="!all">
        AND u.dept_id IN
        <foreach collection="deptIds" item="d" open="(" separator="," close=")">#{d}</foreach>
      </if>
      </script>
      """)
  long usersWithoutRolesCount(@Param("all") boolean all, @Param("deptIds") List<Long> deptIds);

  @Select("SELECT count(*) FROM sys_menu WHERE deleted = 0 AND menu_type IN ('C', 'M')")
  long navigationCount();

  @Select(
      """
      SELECT m.id, m.menu_name, m.menu_type, m.parent_id, m.path, m.module_key
      FROM sys_menu m
      WHERE m.deleted = 0 AND m.menu_type IN ('C', 'M')
        AND NOT EXISTS (SELECT 1 FROM sys_role_navigation n JOIN sys_role r ON r.id = n.role_id AND r.deleted = 0
                        WHERE n.menu_id = m.id)
      ORDER BY m.parent_id, m.sort, m.id
      """)
  List<NavigationRow> unassignedNavigation();
}
