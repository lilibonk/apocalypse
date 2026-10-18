package io.apocalypse.framework.security;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

import org.springframework.security.authentication.BadCredentialsException;

/** 同一数据库视图和可信时刻下的身份、授予及范围；不是跨调用权限缓存。 */
public record AuthorizationSnapshot(
    Long userId,
    String username,
    TokenVersionStore.VersionSnapshot versions,
    Instant evaluatedAt,
    Instant nextTransitionAt,
    List<String> roles,
    List<String> permissions,
    List<String> executablePermissions,
    Map<String, AuthorizationScope> scopes,
    String snapshotId) {
  public AuthorizationSnapshot {
    roles = List.copyOf(roles);
    permissions = List.copyOf(permissions);
    executablePermissions = List.copyOf(executablePermissions);
    scopes = Map.copyOf(scopes);
  }

  public boolean allows(String permission) {
    return executablePermissions.contains(permission);
  }

  public List<String> allScopePerms() {
    return scopes.entrySet().stream()
        .filter(entry -> entry.getValue().all())
        .map(Map.Entry::getKey)
        .sorted()
        .toList();
  }

  public AuthorizationSnapshot restrictTo(AuthorizationSnapshot earlier) {
    if (!userId.equals(earlier.userId()) || !username.equals(earlier.username())) {
      throw new BadCredentialsException("授权上下文身份不一致");
    }
    Map<String, AuthorizationScope> restricted = new TreeMap<>();
    scopes.forEach(
        (permission, scope) -> {
          AuthorizationScope previous = earlier.scopes().get(permission);
          if (previous != null) {
            restricted.put(permission, scope.intersect(previous));
          }
        });
    return new AuthorizationSnapshot(
        userId,
        username,
        versions,
        evaluatedAt,
        nextTransitionAt,
        roles,
        permissions.stream().filter(earlier.permissions()::contains).toList(),
        executablePermissions.stream().filter(earlier.executablePermissions()::contains).toList(),
        restricted,
        snapshotId);
  }
}
