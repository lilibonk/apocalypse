package io.apocalypse.calendar.domain;

public record ManagedEventDraftSave(
    Long calendarId,
    Long eventId,
    int expectedDraftVersion,
    EventContent content,
    String contentHash,
    String actor) {}
