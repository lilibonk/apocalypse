package io.apocalypse.framework.security;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

/**
 * JWT 持久化版本存储：全局授权版本用于角色/菜单变更，用户授权版本用于单用户角色变更，凭证版本用于禁用、删除与改密。
 *
 * <p>PostgreSQL 是安全版本的唯一真源。失效递增直接加入调用方业务事务，数据库写失败会让权限/凭证变更一并回滚；Redis 丢失、回退或清空不会让已撤销 JWT 重新有效。
 */
@Component
@RequiredArgsConstructor
public class TokenVersionStore {

  private static final String TABLE = "security_token_version";

  private static final String GLOBAL_AUTHORIZATION_FIELD = "authorization:global";

  private static final String USER_AUTHORIZATION_PREFIX = "authorization:user:";

  private static final String CREDENTIAL_PREFIX = "credential:user:";

  private final JdbcTemplate jdbcTemplate;

  /** 当前用户令牌需要携带并逐请求核验的版本快照。 */
  public record VersionSnapshot(
      long globalAuthorization, long userAuthorization, long credential) {}

  public VersionSnapshot current(String username) {
    List<String> keys =
        List.of(
            GLOBAL_AUTHORIZATION_FIELD,
            USER_AUTHORIZATION_PREFIX + username,
            CREDENTIAL_PREFIX + username);
    Map<String, Long> versions = new HashMap<>();
    jdbcTemplate
        .query(
            "SELECT version_key, version_value FROM " + TABLE + " WHERE version_key IN (?, ?, ?)",
            (resultSet, rowNumber) -> Map.entry(resultSet.getString(1), resultSet.getLong(2)),
            keys.toArray())
        .forEach(entry -> versions.put(entry.getKey(), entry.getValue()));
    return new VersionSnapshot(
        versions.getOrDefault(keys.get(0), 0L),
        versions.getOrDefault(keys.get(1), 0L),
        versions.getOrDefault(keys.get(2), 0L));
  }

  /** 角色、菜单定义或角色关联变化：在业务事务内让全部旧 access token 失效，refresh 仍可换取新权限。 */
  public void invalidateGlobalAuthorization() {
    increment(GLOBAL_AUTHORIZATION_FIELD);
  }

  /** 单个用户的角色变化：在业务事务内只让该用户的旧 access token 失效。 */
  public void invalidateUserAuthorization(String username) {
    increment(USER_AUTHORIZATION_PREFIX + username);
  }

  /** 用户禁用、删除或改密：在业务事务内同时废止该用户的 access 与 refresh token。 */
  public void invalidateCredential(String username) {
    increment(CREDENTIAL_PREFIX + username);
  }

  private void increment(String field) {
    jdbcTemplate.update(
        """
        INSERT INTO security_token_version (version_key, version_value)
        VALUES (?, 1)
        ON CONFLICT (version_key) DO UPDATE
        SET version_value = security_token_version.version_value + 1
        """,
        field);
  }
}
