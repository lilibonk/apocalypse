package io.apocalypse.calendar.domain;

public record PrivateEventUpdate(
    Long eventId,
    Long calendarId,
    Long ownerUserId,
    int expectedVersion,
    EventContent content,
    String contentHash,
    String actor) {}
