package io.apocalypse.calendar.api;

public record ProjectedEventCommand(
    String sourceType, String sourceKey, long sourceVersion, ProjectedEventContent content) {}
