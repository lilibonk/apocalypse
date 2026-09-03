package io.apocalypse.calendar.domain;

public record EventRevisionSnapshot(
    Long id,
    Long eventId,
    int revisionNo,
    EventRevisionState state,
    EventContent content,
    String contentHash,
    int version) {}
