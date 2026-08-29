package io.apocalypse.system.dict.entity;

import io.apocalypse.common.entity.BaseEntity;

import com.baomidou.mybatisplus.annotation.TableName;

import lombok.Getter;
import lombok.Setter;

/** 字典类型（对应 {@code sys_dict_type}）。 */
@Getter
@Setter
@TableName("sys_dict_type")
public class SysDictTypeEntity extends BaseEntity {

  /** 状态：正常。 */
  public static final int STATUS_ENABLED = 1;

  /** 状态：停用。 */
  public static final int STATUS_DISABLED = 0;

  private String dictType;

  private String dictName;

  private Integer status;
}
