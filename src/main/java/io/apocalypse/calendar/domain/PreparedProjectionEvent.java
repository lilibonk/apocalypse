package io.apocalypse.calendar.domain;

public record PreparedProjectionEvent(
    String sourceType,
    String sourceKey,
    long sourceVersion,
    EventContent content,
    String payloadHash) {}
