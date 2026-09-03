package io.apocalypse.calendar.infrastructure.persistence;

import io.apocalypse.common.entity.BaseEntity;

import java.time.LocalDate;
import java.time.LocalDateTime;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@TableName("cal_override_conflict")
public class OverrideConflictDo extends BaseEntity {

  private Long overrideItemId;

  private String triggerType;

  private String triggerKey;

  private String previousUnderlayJson;

  private String currentUnderlayJson;

  private String previousHash;

  private String currentHash;

  private String state;

  private LocalDateTime detectedAt;

  private LocalDateTime resolvedAt;

  private String resolvedBy;

  private Long resolutionRevisionId;

  @TableField(exist = false)
  private Long revisionId;

  @TableField(exist = false)
  private Long calendarId;

  @TableField(exist = false)
  private String scopeType;

  @TableField(exist = false)
  private Long ownerUserId;

  @TableField(exist = false)
  private LocalDate localDate;

  @TableField(exist = false)
  private String fieldKey;
}
