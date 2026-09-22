package io.apocalypse.system.menu.dto.response;

import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

/** 菜单树节点（type：C=目录 M=菜单 F=按钮）。 */
public record MenuTreeNode(
    Long id,
    Long parentId,
    String menuName,
    String type,
    @Schema(nullable = true) String path,
    @Schema(nullable = true) String component,
    @Schema(nullable = true) String perms,
    @Schema(nullable = true) String icon,
    @Schema(nullable = true) String moduleKey,
    Integer sort,
    @Schema(nullable = true) String remark,
    List<MenuTreeNode> children,
    Integer visible,
    Integer status) {}
