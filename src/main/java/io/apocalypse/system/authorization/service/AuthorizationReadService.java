package io.apocalypse.system.authorization.service;

import io.apocalypse.framework.capability.CapabilityRegistry;
import io.apocalypse.framework.security.AuthorizationScope;
import io.apocalypse.framework.security.AuthorizationSnapshot;
import io.apocalypse.framework.security.PermissionActionRegistry;
import io.apocalypse.framework.security.TokenVersionStore;
import io.apocalypse.framework.security.UserAuthorizationQuery;
import io.apocalypse.system.authorization.dto.response.AuthorizationGrantRow;
import io.apocalypse.system.authorization.mapper.AuthorizationReadMapper;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;
import java.util.TreeSet;

import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

/** 业务授权唯一读源：独立 grant、固定时间窗口、能力状态及部门范围。 */
@Service
@RequiredArgsConstructor
public class AuthorizationReadService implements UserAuthorizationQuery {
  private final AuthorizationReadMapper mapper;

  private final PermissionActionRegistry registry;

  private final CapabilityRegistry capabilities;

  private final Clock authorizationClock;

  @Override
  public AuthorizationSnapshot read(Long userId, String username, Instant evaluatedAt) {
    AuthorizationSnapshot snapshot = snapshot(userId, evaluatedAt);
    if (!snapshot.username().equals(username)) {
      throw new BadCredentialsException("凭证已失效");
    }
    return snapshot;
  }

  /** 登录、当前用户投影及兼容只读服务使用；执行守卫另行核验 JWT 身份和版本。 */
  public AuthorizationSnapshot snapshotForUser(Long userId) {
    return snapshot(userId, authorizationClock.instant());
  }

  private AuthorizationSnapshot snapshot(Long userId, Instant evaluatedAt) {
    List<AuthorizationGrantRow> rows = mapper.snapshot(userId);
    if (rows.isEmpty()) {
      throw new BadCredentialsException("凭证已失效");
    }
    AuthorizationGrantRow identity = rows.getFirst();
    var versions =
        new TokenVersionStore.VersionSnapshot(
            identity.globalVersion(), identity.userVersion(), identity.credentialVersion());
    List<Long> departmentTree = parseDepartments(identity.departmentIds());
    TreeSet<String> roles = new TreeSet<>();
    TreeSet<String> permissions = new TreeSet<>();
    TreeSet<String> executable = new TreeSet<>();
    Map<String, AuthorizationScope> scopes = new TreeMap<>();
    Instant nextTransition = null;
    List<String> fingerprint = new ArrayList<>();
    fingerprint.add("authorization:v2");
    fingerprint.add(identity.userId().toString());
    fingerprint.add(identity.username());
    fingerprint.add(versions.toString());
    fingerprint.add(capabilities.cacheDiscriminator());
    fingerprint.add(Objects.toString(identity.departmentId(), ""));
    fingerprint.add(departmentTree.toString());
    for (AuthorizationGrantRow row : rows) {
      if (row.roleKey() != null) {
        roles.add(row.roleKey());
        fingerprint.add(row.roleId() + ":" + row.roleKey() + ":" + row.roleScope());
      }
      if (row.code() == null || !capabilities.isEnabled(row.moduleKey())) {
        continue;
      }
      var action = registry.find(row.code()).orElse(null);
      boolean legacy = "LEGACY".equals(row.lifecycle());
      boolean executableAction =
          action != null
              && !action.legacy()
              && !legacy
              && Objects.equals(action.moduleKey(), row.moduleKey())
              && action.scopeOverrides().contains(row.scopeOverride())
              && List.of("ACTIVE", "DEPRECATED").contains(row.lifecycle());
      // 历史身份仅保留投影，不让未登记的数据库字符串产生执行入口。
      if (!executableAction && !legacy) {
        continue;
      }
      boolean active = activeAt(row, evaluatedAt);
      fingerprint.add(row.roleId().toString());
      fingerprint.add(row.permissionId().toString());
      fingerprint.add(row.code());
      fingerprint.add(row.moduleKey());
      fingerprint.add(row.lifecycle());
      fingerprint.add(row.scopeOverride());
      fingerprint.add(Objects.toString(row.validFrom(), null));
      fingerprint.add(Objects.toString(row.validUntil(), null));
      fingerprint.add(Boolean.toString(active));
      nextTransition = earlierFuture(nextTransition, row.validFrom(), evaluatedAt);
      nextTransition = earlierFuture(nextTransition, row.validUntil(), evaluatedAt);
      if (!active) {
        continue;
      }
      permissions.add(row.code());
      if (executableAction) {
        executable.add(row.code());
        if (action.systemScope()) {
          String scope =
              PermissionActionRegistry.INHERIT_ROLE.equals(row.scopeOverride())
                  ? row.roleScope()
                  : row.scopeOverride();
          AuthorizationScope resolved =
              switch (scope) {
                case "ALL" -> new AuthorizationScope(true, List.of());
                case "DEPT" ->
                    new AuthorizationScope(
                        false,
                        identity.departmentId() == null
                            ? List.of()
                            : List.of(identity.departmentId()));
                case "DEPT_AND_CHILDREN" -> new AuthorizationScope(false, departmentTree);
                default -> throw new IllegalStateException("授权数据范围无效");
              };
          scopes.merge(row.code(), resolved, AuthorizationReadService::union);
        }
      }
    }
    fingerprint.add("effective-permissions");
    fingerprint.add(permissions.toString());
    fingerprint.add(executable.toString());
    scopes.forEach(
        (code, scope) -> {
          fingerprint.add(code);
          fingerprint.add(Boolean.toString(scope.all()));
          fingerprint.add(scope.departmentIds().toString());
        });
    return new AuthorizationSnapshot(
        identity.userId(),
        identity.username(),
        versions,
        evaluatedAt,
        nextTransition,
        List.copyOf(roles),
        List.copyOf(permissions),
        List.copyOf(executable),
        scopes,
        fingerprint(fingerprint));
  }

  private static boolean activeAt(AuthorizationGrantRow row, Instant at) {
    return (row.validFrom() == null || !at.isBefore(row.validFrom()))
        && (row.validUntil() == null || at.isBefore(row.validUntil()));
  }

  private static Instant earlierFuture(Instant current, Instant candidate, Instant at) {
    return candidate != null
            && candidate.isAfter(at)
            && (current == null || candidate.isBefore(current))
        ? candidate
        : current;
  }

  private static List<Long> parseDepartments(String value) {
    return value == null
        ? List.of()
        : java.util.Arrays.stream(value.split(",")).map(Long::valueOf).toList();
  }

  private static AuthorizationScope union(AuthorizationScope left, AuthorizationScope right) {
    if (left.all() || right.all()) {
      return new AuthorizationScope(true, List.of());
    }
    TreeSet<Long> departments = new TreeSet<>(left.departmentIds());
    departments.addAll(right.departmentIds());
    return new AuthorizationScope(false, List.copyOf(departments));
  }

  private static String fingerprint(List<String> fields) {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      for (String field : fields) {
        byte[] bytes = field == null ? new byte[0] : field.getBytes(StandardCharsets.UTF_8);
        digest.update(ByteBuffer.allocate(4).putInt(field == null ? -1 : bytes.length).array());
        digest.update(bytes);
      }
      return HexFormat.of().formatHex(digest.digest());
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException("SHA-256 不可用", e);
    }
  }
}
