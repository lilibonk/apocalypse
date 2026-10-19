package io.apocalypse.system.authorization.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;

/** 未分配给任何（未删除）角色的 C/M 导航入口；关闭模块的入口同样列出并标记。 */
public record UnassignedNavigationResp(
    Long menuId,
    String menuName,
    String menuType,
    Long parentId,
    @Schema(nullable = true) String path,
    @Schema(nullable = true) String moduleKey,
    boolean moduleEnabled) {}
