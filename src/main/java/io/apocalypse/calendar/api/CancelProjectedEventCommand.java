package io.apocalypse.calendar.api;

public record CancelProjectedEventCommand(
    String sourceType, String sourceKey, long sourceVersion) {}
