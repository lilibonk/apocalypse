package io.apocalypse.calendar.infrastructure.persistence;

import io.apocalypse.common.entity.BaseEntity;

import com.baomidou.mybatisplus.annotation.TableName;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@TableName("cal_event")
public class CalendarEventDo extends BaseEntity {

  private Long calendarId;

  private String eventKind;

  private Long ownerUserId;

  private String sourceKind;

  private String state;
}
