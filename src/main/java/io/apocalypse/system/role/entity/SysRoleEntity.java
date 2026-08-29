package io.apocalypse.system.role.entity;

import io.apocalypse.common.entity.BaseEntity;

import com.baomidou.mybatisplus.annotation.TableName;

import lombok.Getter;
import lombok.Setter;

/** 系统角色（对应 {@code sys_role}）。 */
@Getter
@Setter
@TableName("sys_role")
public class SysRoleEntity extends BaseEntity {

  /** 状态：正常。 */
  public static final int STATUS_ENABLED = 1;

  /** 状态：禁用。 */
  public static final int STATUS_DISABLED = 0;

  private String roleName;

  private String roleKey;

  private Integer sort;

  private Integer status;
}
