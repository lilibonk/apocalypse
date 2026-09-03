package io.apocalypse.calendar.domain;

public record CalendarEventSnapshot(
    Long id,
    Long calendarId,
    EventKind kind,
    Long ownerUserId,
    EventSourceKind sourceKind,
    EventState state,
    int version,
    EventRevisionSnapshot revision) {}
