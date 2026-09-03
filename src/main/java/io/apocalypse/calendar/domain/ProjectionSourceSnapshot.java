package io.apocalypse.calendar.domain;

public record ProjectionSourceSnapshot(
    Long id,
    Long calendarId,
    Long eventId,
    String sourceSystem,
    String sourceType,
    String sourceKey,
    long sourceVersion,
    String payloadHash,
    ProjectionSourceState state,
    int version) {}
