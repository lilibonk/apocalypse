package io.apocalypse.system.menu.entity;

import io.apocalypse.common.entity.BaseEntity;

import com.baomidou.mybatisplus.annotation.TableName;

import lombok.Getter;
import lombok.Setter;

/** 系统菜单（对应 {@code sys_menu}，统一权限树：C=目录 M=菜单 F=按钮）。 */
@Getter
@Setter
@TableName("sys_menu")
public class SysMenuEntity extends BaseEntity {

  private Long parentId;

  private String menuName;

  private String menuType;

  private String path;

  private String component;

  private String perms;

  private String icon;

  private Integer sort;

  private Integer visible;

  private Integer status;
}
