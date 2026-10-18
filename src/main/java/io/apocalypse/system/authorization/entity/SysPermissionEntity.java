package io.apocalypse.system.authorization.entity;

import io.apocalypse.common.entity.BaseEntity;

import com.baomidou.mybatisplus.annotation.FieldStrategy;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;

import lombok.Getter;
import lombok.Setter;

/** 独立业务权限定义；code 与声明归属由迁移和代码注册表维护。 */
@Getter
@Setter
@TableName("sys_permission")
public class SysPermissionEntity extends BaseEntity {
  private String code;

  private String name;

  @TableField(updateStrategy = FieldStrategy.ALWAYS)
  private String description;

  private String moduleKey;

  private String resource;

  private String action;

  private Integer status;

  private String lifecycle;

  private String declarationSource;
}
