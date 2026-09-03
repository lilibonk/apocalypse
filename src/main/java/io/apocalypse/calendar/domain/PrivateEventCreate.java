package io.apocalypse.calendar.domain;

public record PrivateEventCreate(
    Long calendarId, Long ownerUserId, EventContent content, String contentHash, String actor) {}
