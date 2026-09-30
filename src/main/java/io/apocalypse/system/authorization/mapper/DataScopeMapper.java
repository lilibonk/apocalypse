package io.apocalypse.system.authorization.mapper;

import io.apocalypse.system.authorization.dto.response.RoleScopeGrantResp;

import java.util.List;

import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/** 授权投影，不向其他子域公开持久化实体。 */
public interface DataScopeMapper {
  @Select("SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext('system-data-scope'))) locked")
  Integer lockAuthorization();

  @Select(
      """
      SELECT DISTINCT r.data_scope, m.module_key FROM sys_role r
      JOIN sys_user_role ur ON ur.role_id = r.id
      JOIN sys_user u ON u.id = ur.user_id
      JOIN sys_role_menu rm ON rm.role_id = r.id
      JOIN sys_menu m ON m.id = rm.menu_id
      WHERE u.id = #{userId} AND u.username = #{username} AND u.deleted = 0 AND u.status = 1
        AND r.deleted = 0 AND r.status = 1
        AND m.deleted = 0 AND m.status = 1 AND m.perms = #{permission}
      """)
  List<RoleScopeGrantResp> selectGrants(
      @Param("userId") Long userId,
      @Param("username") String username,
      @Param("permission") String permission);

  @Select(
      """
      WITH RECURSIVE active_depts AS (
        SELECT id, parent_id FROM sys_dept WHERE parent_id = 0 AND deleted = 0 AND status = 1
        UNION
        SELECT d.id, d.parent_id FROM sys_dept d JOIN active_depts a ON d.parent_id = a.id
        WHERE d.deleted = 0 AND d.status = 1
      ), allowed AS (
        SELECT a.id, a.parent_id FROM active_depts a JOIN sys_user u ON u.dept_id = a.id
        WHERE u.id = #{userId} AND u.deleted = 0 AND u.status = 1
        UNION
        SELECT a.id, a.parent_id FROM active_depts a JOIN allowed p ON a.parent_id = p.id
        WHERE #{children}
      )
      SELECT id FROM allowed ORDER BY id
      """)
  List<Long> selectAllowedDepartments(
      @Param("userId") Long userId, @Param("children") boolean children);

  @Select(
      """
      SELECT EXISTS (SELECT 1 FROM sys_user_role ur JOIN sys_role r ON r.id = ur.role_id
        WHERE ur.user_id = #{userId} AND r.deleted = 0 AND r.status = 1 AND r.data_scope = 'ALL')
      """)
  boolean hasEffectiveAllRole(@Param("userId") Long userId);
}
