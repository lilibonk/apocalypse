package io.apocalypse.calendar.domain;

public record ProjectionGrantSnapshot(
    Long id,
    Long calendarId,
    String sourceSystem,
    ProjectionPublishMode publishMode,
    ProjectionGrantState state,
    int version) {}
