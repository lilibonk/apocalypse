package io.apocalypse.calendar.application;

import io.apocalypse.calendar.domain.CalendarEventSnapshot;
import io.apocalypse.calendar.domain.EventContent;
import io.apocalypse.calendar.domain.EventTimeKind;
import io.apocalypse.calendar.interfaces.dto.response.CalendarEventResp;
import io.apocalypse.calendar.interfaces.dto.response.EventContentResp;

import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;

final class CalendarEventResponseMapper {

  private CalendarEventResponseMapper() {}

  static CalendarEventResp toResponse(CalendarEventSnapshot event) {
    return new CalendarEventResp(
        event.id(),
        event.calendarId(),
        event.kind(),
        event.ownerUserId(),
        event.sourceKind(),
        event.state(),
        event.version(),
        event.revision().revisionNo(),
        event.revision().version(),
        event.revision().state(),
        event.revision().contentHash(),
        toResponse(event.revision().content()));
  }

  private static EventContentResp toResponse(EventContent content) {
    if (content.timeKind() == EventTimeKind.ALL_DAY) {
      return new EventContentResp(
          content.title(),
          content.description(),
          content.location(),
          content.timeKind(),
          content.startDate(),
          content.endDateExclusive(),
          null,
          null,
          null,
          null,
          null);
    }
    ZoneId zoneId = ZoneId.of(content.zoneId());
    ZonedDateTime start = content.startAtUtc().toInstant(ZoneOffset.UTC).atZone(zoneId);
    ZonedDateTime end = content.endAtUtc().toInstant(ZoneOffset.UTC).atZone(zoneId);
    return new EventContentResp(
        content.title(),
        content.description(),
        content.location(),
        content.timeKind(),
        null,
        null,
        start.toLocalDateTime(),
        end.toLocalDateTime(),
        zoneId.getId(),
        start.getOffset().getId(),
        end.getOffset().getId());
  }
}
