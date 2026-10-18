package io.apocalypse.framework.security;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;

import org.springframework.stereotype.Component;

/** 代码拥有动作身份及支持的范围；数据库只能管理声明过的动作，不能创造执行入口。 */
@Component
public class PermissionActionRegistry {

  public static final String INHERIT_ROLE = "INHERIT_ROLE";

  private final Map<String, Action> actions;

  public PermissionActionRegistry(List<PermissionActionDefinition> definitions) {
    Map<String, Action> declared = new TreeMap<>();
    for (PermissionActionDefinition definition : definitions) {
      for (Action action : definition.actions()) {
        if (declared.putIfAbsent(action.code(), action) != null) {
          throw new IllegalStateException("重复权限动作声明: " + action.code());
        }
      }
    }
    actions = Collections.unmodifiableMap(declared);
  }

  public Optional<Action> find(String code) {
    return Optional.ofNullable(actions.get(code));
  }

  public boolean isExecutable(String code) {
    return find(code).filter(action -> !action.legacy()).isPresent();
  }

  public List<Action> actions() {
    return List.copyOf(actions.values());
  }

  public record Action(
      String code,
      String moduleKey,
      boolean systemScope,
      List<String> scopeOverrides,
      boolean legacy) {
    public Action {
      if (code == null || !code.matches("[a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)+")) {
        throw new IllegalArgumentException("非法权限动作声明");
      }
      if (moduleKey != null && !moduleKey.matches("[a-z][a-z0-9-]{0,63}")) {
        throw new IllegalArgumentException("非法权限模块声明");
      }
      scopeOverrides = List.copyOf(scopeOverrides);
      if (!scopeOverrides.contains(INHERIT_ROLE)
          || !List.of(INHERIT_ROLE, "ALL", "DEPT", "DEPT_AND_CHILDREN").containsAll(scopeOverrides)
          || (!systemScope && !scopeOverrides.equals(List.of(INHERIT_ROLE)))) {
        throw new IllegalArgumentException("非法权限范围声明");
      }
    }

    public static Action business(String code, String moduleKey, boolean systemScope) {
      return new Action(
          code,
          moduleKey,
          systemScope,
          systemScope
              ? List.of(INHERIT_ROLE, "ALL", "DEPT", "DEPT_AND_CHILDREN")
              : List.of(INHERIT_ROLE),
          false);
    }

    public static Action legacy(String code) {
      return new Action(code, null, false, List.of(INHERIT_ROLE), true);
    }
  }
}
