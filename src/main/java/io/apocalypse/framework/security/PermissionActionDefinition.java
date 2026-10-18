package io.apocalypse.framework.security;

import java.util.List;

/** 模块入口声明的纯元数据；关闭可选模块时仍可装配，不读取任何运行资源。 */
public record PermissionActionDefinition(List<PermissionActionRegistry.Action> actions) {
  public PermissionActionDefinition {
    actions = List.copyOf(actions);
  }
}
