package io.apocalypse.calendar.api;

public record ProjectionItemResult(
    String sourceType,
    String sourceKey,
    long acceptedVersion,
    Long eventId,
    ProjectionResultStatus status) {}
