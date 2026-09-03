package io.apocalypse.calendar.domain;

public record CalendarMemberSnapshot(
    Long id,
    Long calendarId,
    Long userId,
    CalendarRole role,
    CalendarMemberState state,
    int version) {}
