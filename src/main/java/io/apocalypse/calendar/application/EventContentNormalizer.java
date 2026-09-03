package io.apocalypse.calendar.application;

import io.apocalypse.calendar.api.CalendarErrorCode;
import io.apocalypse.calendar.api.ProjectedEventContent;
import io.apocalypse.calendar.api.ProjectionTimeKind;
import io.apocalypse.calendar.domain.DstOffsetChoice;
import io.apocalypse.calendar.domain.EventContent;
import io.apocalypse.calendar.domain.EventTimeKind;
import io.apocalypse.calendar.interfaces.dto.request.EventContentReq;
import io.apocalypse.common.exception.BizException;

import java.time.DateTimeException;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;

import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
public class EventContentNormalizer {

  public EventContent normalize(EventContentReq request) {
    if (request == null || request.timeKind() == null) {
      throw invalidTime();
    }
    String title = requireText(request.title(), 200);
    String description = optionalText(request.description(), 2_000);
    String location = optionalText(request.location(), 256);
    return switch (request.timeKind()) {
      case ALL_DAY -> allDay(request, title, description, location);
      case TIMED -> timed(request, title, description, location);
    };
  }

  public EventContent normalize(ProjectedEventContent request) {
    if (request == null || request.timeKind() == null) {
      throw invalidTime();
    }
    String title = requireText(request.title(), 200);
    String description = optionalText(request.description(), 2_000);
    String location = optionalText(request.location(), 256);
    if (request.timeKind() == ProjectionTimeKind.ALL_DAY) {
      if (request.startDate() == null
          || request.endDateExclusive() == null
          || !request.startDate().isBefore(request.endDateExclusive())
          || request.startInstant() != null
          || request.endInstant() != null
          || request.zoneId() != null) {
        throw invalidTime();
      }
      return new EventContent(
          title,
          description,
          location,
          EventTimeKind.ALL_DAY,
          request.startDate(),
          request.endDateExclusive(),
          null,
          null,
          null);
    }
    if (request.startDate() != null
        || request.endDateExclusive() != null
        || request.startInstant() == null
        || request.endInstant() == null
        || !request.startInstant().isBefore(request.endInstant())
        || !StringUtils.hasText(request.zoneId())) {
      throw invalidTime();
    }
    ZoneId zoneId;
    try {
      zoneId = ZoneId.of(request.zoneId());
    } catch (DateTimeException e) {
      CalendarErrorCode error = CalendarErrorCode.CALENDAR_TIME_ZONE_INVALID;
      throw new BizException(error.getCode(), error.getMessage());
    }
    return new EventContent(
        title,
        description,
        location,
        EventTimeKind.TIMED,
        null,
        null,
        LocalDateTime.ofInstant(request.startInstant(), ZoneOffset.UTC),
        LocalDateTime.ofInstant(request.endInstant(), ZoneOffset.UTC),
        zoneId.getId());
  }

  private static EventContent allDay(
      EventContentReq request, String title, String description, String location) {
    if (request.startDate() == null
        || request.endDateExclusive() == null
        || !request.startDate().isBefore(request.endDateExclusive())
        || request.startLocal() != null
        || request.endLocal() != null
        || request.zoneId() != null
        || request.startOffsetChoice() != null
        || request.endOffsetChoice() != null) {
      throw invalidTime();
    }
    return new EventContent(
        title,
        description,
        location,
        EventTimeKind.ALL_DAY,
        request.startDate(),
        request.endDateExclusive(),
        null,
        null,
        null);
  }

  private static EventContent timed(
      EventContentReq request, String title, String description, String location) {
    if (request.startDate() != null
        || request.endDateExclusive() != null
        || request.startLocal() == null
        || request.endLocal() == null
        || !StringUtils.hasText(request.zoneId())) {
      throw invalidTime();
    }
    ZoneId zoneId;
    try {
      zoneId = ZoneId.of(request.zoneId());
    } catch (DateTimeException e) {
      CalendarErrorCode error = CalendarErrorCode.CALENDAR_TIME_ZONE_INVALID;
      throw new BizException(error.getCode(), error.getMessage());
    }
    Instant start = resolve(request.startLocal(), zoneId, request.startOffsetChoice()).toInstant();
    Instant end = resolve(request.endLocal(), zoneId, request.endOffsetChoice()).toInstant();
    if (!start.isBefore(end)) {
      throw invalidTime();
    }
    return new EventContent(
        title,
        description,
        location,
        EventTimeKind.TIMED,
        null,
        null,
        LocalDateTime.ofInstant(start, ZoneOffset.UTC),
        LocalDateTime.ofInstant(end, ZoneOffset.UTC),
        zoneId.getId());
  }

  private static ResolvedLocalTime resolve(
      LocalDateTime local, ZoneId zoneId, DstOffsetChoice choice) {
    List<ZoneOffset> offsets = zoneId.getRules().getValidOffsets(local);
    if (offsets.isEmpty()) {
      CalendarErrorCode error = CalendarErrorCode.CALENDAR_LOCAL_TIME_GAP;
      throw new BizException(error.getCode(), error.getMessage());
    }
    if (offsets.size() > 1 && choice == null) {
      CalendarErrorCode error = CalendarErrorCode.CALENDAR_LOCAL_TIME_AMBIGUOUS;
      throw new BizException(error.getCode(), error.getMessage());
    }
    ZoneOffset offset =
        offsets.size() == 1 || choice == DstOffsetChoice.EARLIER
            ? offsets.getFirst()
            : offsets.getLast();
    return new ResolvedLocalTime(local.toInstant(offset), offset);
  }

  private static String requireText(String value, int maxLength) {
    if (!StringUtils.hasText(value)) {
      throw invalidTime();
    }
    String normalized = value.trim();
    if (normalized.length() > maxLength || normalized.indexOf('\0') >= 0) {
      throw invalidTime();
    }
    return normalized;
  }

  private static String optionalText(String value, int maxLength) {
    if (value == null) {
      return null;
    }
    String normalized = value.trim();
    if (normalized.isEmpty()) {
      return null;
    }
    if (normalized.length() > maxLength || normalized.indexOf('\0') >= 0) {
      throw invalidTime();
    }
    return normalized;
  }

  private static BizException invalidTime() {
    CalendarErrorCode error = CalendarErrorCode.CALENDAR_EVENT_TIME_INVALID;
    return new BizException(error.getCode(), error.getMessage());
  }

  private record ResolvedLocalTime(Instant instant, ZoneOffset offset) {
    Instant toInstant() {
      return instant;
    }
  }
}
