package io.apocalypse.system.menu.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** 菜单保存请求（创建/更新共用）。 */
public record MenuSaveReq(
    @NotNull(message = "父菜单不能为空") Long parentId,
    @NotBlank(message = "菜单名称不能为空") @Size(max = 64, message = "菜单名称最长 64 字符") String menuName,
    @NotBlank(message = "菜单类型不能为空") @Pattern(regexp = "[CMF]", message = "菜单类型仅支持 C/M/F")
        String menuType,
    @Size(max = 128, message = "路由地址最长 128 字符") String path,
    @Size(max = 128, message = "组件路径最长 128 字符") String component,
    @Size(max = 128, message = "权限标识最长 128 字符") String perms,
    @Size(max = 64, message = "图标最长 64 字符") String icon,
    Integer sort,
    Integer visible,
    Integer status,
    @Size(max = 500, message = "备注最长 500 字符") String remark) {}
