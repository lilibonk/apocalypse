package io.apocalypse.calendar.domain;

public record DayFieldSource(
    SourceLayer layer,
    Long sourceCalendarId,
    String sourceCalendarKey,
    String sourceVersion,
    OverrideAction action) {}
