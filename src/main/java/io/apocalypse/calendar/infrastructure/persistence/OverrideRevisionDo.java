package io.apocalypse.calendar.infrastructure.persistence;

import io.apocalypse.common.entity.BaseEntity;

import java.time.LocalDateTime;

import com.baomidou.mybatisplus.annotation.TableName;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@TableName("cal_override_revision")
public class OverrideRevisionDo extends BaseEntity {

  private Long calendarId;

  private String scopeType;

  private Long ownerUserId;

  private Integer revisionNo;

  private String state;

  private Long baselineReleaseId;

  private Long sourceImportId;

  private String contentHash;

  private LocalDateTime publishedAt;

  private String publishedBy;

  private LocalDateTime withdrawnAt;

  private String withdrawnBy;
}
