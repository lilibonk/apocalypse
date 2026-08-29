package io.apocalypse.system.config.entity;

import io.apocalypse.common.entity.BaseEntity;

import com.baomidou.mybatisplus.annotation.TableName;

import lombok.Getter;
import lombok.Setter;

/** 参数配置（对应 {@code sys_config}，仅业务可调参数）。 */
@Getter
@Setter
@TableName("sys_config")
public class SysConfigEntity extends BaseEntity {

  private String configKey;

  private String configName;

  private String configValue;
}
