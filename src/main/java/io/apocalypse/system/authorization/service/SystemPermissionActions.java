package io.apocalypse.system.authorization.service;

import io.apocalypse.framework.security.PermissionActionDefinition;
import io.apocalypse.framework.security.PermissionActionRegistry.Action;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/** System 模块拥有的稳定业务动作；同一 code 的具体入口仍可另要求 ALL 或对象条件。 */
public final class SystemPermissionActions {
  private SystemPermissionActions() {}

  public static PermissionActionDefinition definition() {
    List<Action> actions = new ArrayList<>();
    Set<String> scopedResources = Set.of("user", "role");
    for (String resource : List.of("user", "role", "menu", "dept", "dict", "config")) {
      for (String verb : List.of("list", "add", "edit", "remove")) {
        boolean scope =
            scopedResources.contains(resource)
                || (Set.of("menu", "dept").contains(resource) && !"list".equals(verb));
        actions.add(Action.business("system:" + resource + ":" + verb, null, scope));
      }
    }
    for (String code :
        List.of(
            "system:log:login",
            "system:log:oper",
            "system:online:list",
            "system:online:kick",
            "system:permission:list")) {
      actions.add(Action.business(code, null, false));
    }
    actions.add(Action.business("system:permission:edit", null, true));
    // 退役 Order 仅保留兼容投影；没有业务方法可以凭这些记录获得执行能力。
    for (String code :
        List.of("order:create", "order:read", "order:read:any", "order:list", "order:list:any")) {
      actions.add(Action.legacy(code));
    }
    return new PermissionActionDefinition(actions);
  }
}
