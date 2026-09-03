package io.apocalypse.calendar.infrastructure.persistence;

import io.apocalypse.common.entity.BaseEntity;

import com.baomidou.mybatisplus.annotation.TableName;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@TableName("cal_projection_grant")
public class ProjectionGrantDo extends BaseEntity {

  private Long calendarId;

  private String sourceSystem;

  private String publishMode;

  private String state;
}
