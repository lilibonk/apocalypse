package io.apocalypse.calendar.domain;

public record ManagedEventDraftCreate(
    Long calendarId, EventContent content, String contentHash, String actor) {}
