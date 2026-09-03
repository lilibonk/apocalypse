package io.apocalypse.calendar.interfaces.dto.response;

import io.apocalypse.calendar.domain.CalendarKind;
import io.apocalypse.calendar.domain.CalendarRole;
import io.apocalypse.calendar.domain.CalendarState;

public record CalendarResp(
    Long id,
    String calendarKey,
    String name,
    CalendarKind kind,
    Long parentId,
    String regionCode,
    String zoneId,
    CalendarState state,
    CalendarRole currentUserRole,
    int version) {}
