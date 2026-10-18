package io.apocalypse.system.authorization.mapper;

import io.apocalypse.system.authorization.dto.response.AuthorizationGrantRow;
import io.apocalypse.system.authorization.dto.response.PermissionDeclarationResp;

import java.util.List;

import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/** 一个 SQL/MVCC 视图装配实时授权，READ_COMMITTED 写事务中也不会拼出撕裂身份和 grant。 */
public interface AuthorizationReadMapper {
  @Select("SELECT code, module_key, lifecycle FROM sys_permission WHERE deleted = 0 ORDER BY code")
  List<PermissionDeclarationResp> declarations();

  @Select(
      """
      WITH RECURSIVE active_depts AS (
        SELECT id, parent_id FROM sys_dept WHERE parent_id = 0 AND deleted = 0 AND status = 1
        UNION
        SELECT d.id, d.parent_id FROM sys_dept d JOIN active_depts a ON d.parent_id = a.id
        WHERE d.deleted = 0 AND d.status = 1
      ), allowed_depts AS (
        SELECT a.id, a.parent_id FROM active_depts a JOIN sys_user u ON u.dept_id = a.id
        WHERE u.id = #{userId} AND u.deleted = 0 AND u.status = 1
        UNION
        SELECT a.id, a.parent_id FROM active_depts a JOIN allowed_depts d ON a.parent_id = d.id
      )
      SELECT u.id AS user_id, u.username,
        (SELECT id FROM active_depts WHERE id = u.dept_id) AS department_id,
        (SELECT string_agg(id::text, ',' ORDER BY id) FROM allowed_depts) AS department_ids,
        COALESCE((SELECT version_value FROM security_token_version
          WHERE version_key = 'authorization:global'), 0) AS global_version,
        COALESCE((SELECT version_value FROM security_token_version
          WHERE version_key = 'authorization:user:' || u.username), 0) AS user_version,
        COALESCE((SELECT version_value FROM security_token_version
          WHERE version_key = 'credential:user:' || u.username), 0) AS credential_version,
        r.id AS role_id, r.role_key, r.data_scope AS role_scope,
        p.id AS permission_id, p.code, p.module_key, p.lifecycle,
        g.scope_override, g.valid_from, g.valid_until
      FROM sys_user u
      LEFT JOIN sys_user_role ur ON ur.user_id = u.id
      LEFT JOIN sys_role r ON r.id = ur.role_id AND r.status = 1 AND r.deleted = 0
      LEFT JOIN sys_role_permission g ON g.role_id = r.id AND g.enabled = TRUE
      LEFT JOIN sys_permission p ON p.id = g.permission_id AND p.status = 1 AND p.deleted = 0
      WHERE u.id = #{userId} AND u.status = 1 AND u.deleted = 0
      ORDER BY r.id, p.id
      """)
  List<AuthorizationGrantRow> snapshot(@Param("userId") Long userId);
}
