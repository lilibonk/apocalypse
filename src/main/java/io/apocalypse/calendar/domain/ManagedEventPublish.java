package io.apocalypse.calendar.domain;

public record ManagedEventPublish(
    Long calendarId,
    Long eventId,
    int expectedDraftVersion,
    String expectedContentHash,
    String actor) {}
