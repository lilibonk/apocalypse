package io.apocalypse.calendar.infrastructure.persistence;

import io.apocalypse.common.entity.BaseEntity;

import java.time.LocalDate;

import com.baomidou.mybatisplus.annotation.TableName;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@TableName("cal_day_override")
public class DayOverrideDo extends BaseEntity {

  private Long revisionId;

  private LocalDate localDate;

  private String fieldKey;

  private String action;

  private String valueJson;

  private String underlayValueJson;

  private String underlayValueHash;

  private String underlaySourceType;

  private String underlaySourceKey;

  private String underlaySourceVersion;
}
