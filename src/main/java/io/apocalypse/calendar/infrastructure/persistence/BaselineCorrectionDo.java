package io.apocalypse.calendar.infrastructure.persistence;

import io.apocalypse.common.entity.BaseEntity;

import java.time.LocalDate;

import com.baomidou.mybatisplus.annotation.TableName;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@TableName("cal_baseline_correction")
public class BaselineCorrectionDo extends BaseEntity {

  private Long releaseId;

  private LocalDate localDate;

  private String fieldKey;

  private String action;

  private Object valueJson;

  private String sourceUri;

  private Long sourceImportId;

  private String reason;
}
