package io.apocalypse.system.file.entity;

import io.apocalypse.common.entity.BaseEntity;

import com.baomidou.mybatisplus.annotation.TableName;

import lombok.Getter;
import lombok.Setter;

/** 通用文件存储台账实体（对应 {@code sys_file}）。 */
@Getter
@Setter
@TableName("sys_file")
public class SysFile extends BaseEntity {

  private String storageKey;

  private String category;

  private String originalFilename;

  private String contentType;

  private Long sizeBytes;

  private String sha256;

  private Long ownerId;

  private String ownerUsername;

  private Long deptId;
}
