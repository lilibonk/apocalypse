package io.apocalypse.calendar.infrastructure.config;

import io.apocalypse.framework.security.PermissionActionDefinition;
import io.apocalypse.framework.security.PermissionActionRegistry.Action;

import java.util.List;

/** 常驻的纯动作元数据，不读取 Calendar 资源或创建运行组件。 */
public final class CalendarPermissionActions {
  private CalendarPermissionActions() {}

  public static PermissionActionDefinition definition() {
    return new PermissionActionDefinition(
        List.of(
                "calendar:day:list",
                "calendar:day:read",
                "calendar:calendar:list",
                "calendar:calendar:add",
                "calendar:calendar:edit",
                "calendar:calendar:archive",
                "calendar:member:list",
                "calendar:member:edit",
                "calendar:personal-override:list",
                "calendar:personal-override:edit",
                "calendar:managed-override:list",
                "calendar:managed-override:edit",
                "calendar:managed-override:publish",
                "calendar:event:list",
                "calendar:event:read",
                "calendar:event:add",
                "calendar:event:edit",
                "calendar:event:remove",
                "calendar:managed-event:list",
                "calendar:managed-event:edit",
                "calendar:managed-event:publish",
                "calendar:data-import:list",
                "calendar:data-import:upload",
                "calendar:data-import:publish",
                "calendar:projection-grant:list",
                "calendar:projection-grant:edit")
            .stream()
            .map(code -> Action.business(code, "calendar", false))
            .toList());
  }
}
