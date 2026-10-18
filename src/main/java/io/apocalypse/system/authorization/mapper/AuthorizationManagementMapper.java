package io.apocalypse.system.authorization.mapper;

import io.apocalypse.system.authorization.dto.request.PermissionGrantSaveReq;
import io.apocalypse.system.authorization.dto.response.RoleAuthorizationRevisionResp;
import io.apocalypse.system.authorization.dto.response.StoredPermissionGrantResp;

import java.util.List;

import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/** 授权管理的完整关联与版本投影，不使用候选页或当前生效条件过滤。 */
public interface AuthorizationManagementMapper {
  @Select(
      """
      SELECT s.revision FROM sys_role_authorization_state s
      JOIN sys_role r ON r.id = s.role_id WHERE r.id = #{roleId} AND r.deleted = 0
      """)
  Long roleRevision(@Param("roleId") Long roleId);

  @Select(
      """
      <script>
      SELECT role_id, revision FROM sys_role_authorization_state WHERE role_id IN
      <foreach collection="roleIds" item="id" open="(" separator="," close=")">#{id}</foreach>
      </script>
      """)
  List<RoleAuthorizationRevisionResp> roleRevisions(@Param("roleIds") List<Long> roleIds);

  @Select("SELECT revision FROM sys_permission_catalog_state WHERE id = 1")
  Long catalogRevision();

  @Insert("INSERT INTO sys_role_authorization_state(role_id, revision) VALUES (#{roleId}, 0)")
  int initializeRole(@Param("roleId") Long roleId);

  @Update(
      """
      UPDATE sys_role_authorization_state SET revision = revision + 1
      WHERE role_id = #{roleId} AND revision = #{expected}
      """)
  int advanceRole(@Param("roleId") Long roleId, @Param("expected") Long expected);

  @Update("UPDATE sys_permission_catalog_state SET revision = revision + 1 WHERE id = 1")
  int advanceCatalog();

  @Update(
      """
      UPDATE sys_role_authorization_state SET revision = revision + 1
      WHERE role_id IN (SELECT role_id FROM sys_role_navigation WHERE menu_id = #{menuId})
      """)
  int advanceNavigationReferences(@Param("menuId") Long menuId);

  @Select(
      """
      SELECT permission_id, enabled, scope_override, valid_from, valid_until
      FROM sys_role_permission WHERE role_id = #{roleId} ORDER BY permission_id
      """)
  List<StoredPermissionGrantResp> grants(@Param("roleId") Long roleId);

  @Insert(
      """
      INSERT INTO sys_role_permission
          (role_id, permission_id, enabled, scope_override, valid_from, valid_until)
      VALUES (#{roleId}, #{grant.permissionId}, #{grant.enabled}, #{grant.scopeOverride},
              #{grant.validFrom}, #{grant.validUntil})
      ON CONFLICT (role_id, permission_id) DO UPDATE
      SET enabled = excluded.enabled, scope_override = excluded.scope_override,
          valid_from = excluded.valid_from, valid_until = excluded.valid_until
      """)
  int upsertGrant(@Param("roleId") Long roleId, @Param("grant") PermissionGrantSaveReq grant);

  @Delete(
      "DELETE FROM sys_role_permission WHERE role_id = #{roleId} AND permission_id = #{permissionId}")
  int removeGrant(@Param("roleId") Long roleId, @Param("permissionId") Long permissionId);

  @Select("SELECT menu_id FROM sys_role_navigation WHERE role_id = #{roleId} ORDER BY menu_id")
  List<Long> navigationIds(@Param("roleId") Long roleId);

  @Insert(
      """
      INSERT INTO sys_role_navigation(role_id, menu_id) VALUES (#{roleId}, #{menuId})
      ON CONFLICT (role_id, menu_id) DO NOTHING
      """)
  int addNavigation(@Param("roleId") Long roleId, @Param("menuId") Long menuId);

  @Delete("DELETE FROM sys_role_navigation WHERE role_id = #{roleId} AND menu_id = #{menuId}")
  int removeNavigation(@Param("roleId") Long roleId, @Param("menuId") Long menuId);
}
