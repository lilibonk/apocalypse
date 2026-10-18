package io.apocalypse.system.authorization.mapper;

import io.apocalypse.system.authorization.dto.response.ProtectedGrantResp;

import java.time.Instant;
import java.util.List;

import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/** 授权投影，不向其他子域公开持久化实体。 */
public interface DataScopeMapper {
  @Select("SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext('system-data-scope'))) locked")
  Integer lockAuthorization();

  @Select(
      """
      SELECT EXISTS (SELECT 1 FROM sys_user_role ur JOIN sys_role r ON r.id = ur.role_id
        WHERE ur.user_id = #{userId} AND r.deleted = 0 AND r.status = 1 AND r.data_scope = 'ALL')
      """)
  boolean hasEffectiveAllRole(@Param("userId") Long userId);

  @Select(
      """
      SELECT DISTINCT p.code, p.module_key
      FROM sys_user_role ur
      JOIN sys_role r ON r.id = ur.role_id AND r.deleted = 0
      JOIN sys_role_permission g ON g.role_id = r.id
      JOIN sys_permission p ON p.id = g.permission_id AND p.deleted = 0
      WHERE ur.user_id = #{userId} AND p.lifecycle IN ('ACTIVE', 'DEPRECATED')
        AND (g.valid_until IS NULL OR g.valid_until > #{evaluatedAt})
        AND CASE WHEN g.scope_override = 'INHERIT_ROLE'
          THEN r.data_scope ELSE g.scope_override END = 'ALL'
      """)
  List<ProtectedGrantResp> potentialAllGrants(
      @Param("userId") Long userId, @Param("evaluatedAt") Instant evaluatedAt);
}
