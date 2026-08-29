package io.apocalypse.system.menu.dto.response;

import java.util.List;

/** 菜单树节点（type：C=目录 M=菜单 F=按钮）。 */
public record MenuTreeNode(
    Long id,
    Long parentId,
    String menuName,
    String type,
    String path,
    String component,
    String perms,
    String icon,
    Integer sort,
    String remark,
    List<MenuTreeNode> children,
    Integer visible,
    Integer status) {}
