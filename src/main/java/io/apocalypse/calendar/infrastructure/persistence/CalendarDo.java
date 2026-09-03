package io.apocalypse.calendar.infrastructure.persistence;

import io.apocalypse.common.entity.BaseEntity;

import com.baomidou.mybatisplus.annotation.TableName;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@TableName("cal_calendar")
public class CalendarDo extends BaseEntity {

  private String calendarKey;

  private String kind;

  private Long parentId;

  private String name;

  private String regionCode;

  private String zoneId;

  private String state;
}
