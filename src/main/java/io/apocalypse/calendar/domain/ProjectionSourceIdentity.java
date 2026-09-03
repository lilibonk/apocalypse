package io.apocalypse.calendar.domain;

/** Internal lock identity, never part of the public facade. */
public record ProjectionSourceIdentity(String sourceType, String sourceKey) {}
