package io.apocalypse.calendar.infrastructure.persistence;

import io.apocalypse.common.entity.BaseEntity;

import com.baomidou.mybatisplus.annotation.TableName;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@TableName("cal_calendar_member")
public class CalendarMemberDo extends BaseEntity {

  private Long calendarId;

  private Long userId;

  private String role;

  private String state;
}
