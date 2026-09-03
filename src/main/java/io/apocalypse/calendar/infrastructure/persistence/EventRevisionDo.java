package io.apocalypse.calendar.infrastructure.persistence;

import io.apocalypse.common.entity.BaseEntity;

import java.time.LocalDate;
import java.time.LocalDateTime;

import com.baomidou.mybatisplus.annotation.TableName;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@TableName("cal_event_revision")
public class EventRevisionDo extends BaseEntity {

  private Long eventId;

  private Integer revisionNo;

  private String state;

  private String title;

  private String description;

  private String location;

  private String timeKind;

  private LocalDate startDate;

  private LocalDate endDateExclusive;

  private LocalDateTime startAtUtc;

  private LocalDateTime endAtUtc;

  private String zoneId;

  private String contentHash;

  private LocalDateTime publishedAt;

  private String publishedBy;

  private LocalDateTime closedAt;

  private String closedBy;
}
