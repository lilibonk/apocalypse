package io.apocalypse.common.entity;

import java.io.Serializable;
import java.time.LocalDateTime;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.Version;

import lombok.Getter;
import lombok.Setter;

/** 实体基类：主键（雪花算法）、审计字段（自动填充）、乐观锁、逻辑删除。 填充处理器见 framework-mybatis 的 MetaObjectHandler 配置。 */
@Getter
@Setter
public abstract class BaseEntity implements Serializable {

  @TableId(type = IdType.ASSIGN_ID)
  private Long id;

  @TableField(fill = FieldFill.INSERT)
  private LocalDateTime createTime;

  @TableField(fill = FieldFill.INSERT_UPDATE)
  private LocalDateTime updateTime;

  @TableField(fill = FieldFill.INSERT)
  private String createBy;

  @TableField(fill = FieldFill.INSERT_UPDATE)
  private String updateBy;

  @Version
  @TableField(fill = FieldFill.INSERT)
  private Integer version;

  @TableLogic
  @TableField(fill = FieldFill.INSERT)
  private Integer deleted;

  /** 备注：用户输入的业务字段，非审计字段，故不加 fill 注解、不参与自动填充。 */
  private String remark;
}
