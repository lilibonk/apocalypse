package io.apocalypse.system.dict.entity;

import io.apocalypse.common.entity.BaseEntity;

import com.baomidou.mybatisplus.annotation.TableName;

import lombok.Getter;
import lombok.Setter;

/** 字典数据（对应 {@code sys_dict_data}）。 */
@Getter
@Setter
@TableName("sys_dict_data")
public class SysDictDataEntity extends BaseEntity {

  /** 状态：正常。 */
  public static final int STATUS_ENABLED = 1;

  /** 状态：停用。 */
  public static final int STATUS_DISABLED = 0;

  private String dictType;

  private String dictLabel;

  private String dictValue;

  private Integer sort;

  private Integer status;
}
