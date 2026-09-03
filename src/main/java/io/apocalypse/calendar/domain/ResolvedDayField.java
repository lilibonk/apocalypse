package io.apocalypse.calendar.domain;

public record ResolvedDayField(
    DayFieldValue value,
    DayFieldSource source,
    DayFieldValue underlay,
    String underlayHash,
    ConflictState conflictState,
    Long conflictId) {}
