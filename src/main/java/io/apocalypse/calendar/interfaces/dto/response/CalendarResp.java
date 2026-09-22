package io.apocalypse.calendar.interfaces.dto.response;

import io.apocalypse.calendar.domain.CalendarKind;
import io.apocalypse.calendar.domain.CalendarRole;
import io.apocalypse.calendar.domain.CalendarState;

import io.swagger.v3.oas.annotations.media.Schema;

public record CalendarResp(
    Long id,
    String calendarKey,
    String name,
    CalendarKind kind,
    @Schema(nullable = true) Long parentId,
    String regionCode,
    String zoneId,
    CalendarState state,
    @Schema(nullable = true) CalendarRole currentUserRole,
    int version) {}
