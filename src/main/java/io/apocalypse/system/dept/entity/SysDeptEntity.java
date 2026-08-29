package io.apocalypse.system.dept.entity;

import io.apocalypse.common.entity.BaseEntity;

import com.baomidou.mybatisplus.annotation.TableName;

import lombok.Getter;
import lombok.Setter;

/** 系统部门（对应 {@code sys_dept}）。树查询用 PostgreSQL WITH RECURSIVE，无 ancestors 冗余列。 */
@Getter
@Setter
@TableName("sys_dept")
public class SysDeptEntity extends BaseEntity {

  /** 状态：正常。 */
  public static final int STATUS_ENABLED = 1;

  /** 状态：停用。 */
  public static final int STATUS_DISABLED = 0;

  private Long parentId;

  private String deptName;

  private String leader;

  private String phone;

  private Integer sort;

  private Integer status;
}
