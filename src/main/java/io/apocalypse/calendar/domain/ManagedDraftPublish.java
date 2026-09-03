package io.apocalypse.calendar.domain;

public record ManagedDraftPublish(
    Long calendarId, int expectedDraftVersion, String expectedContentHash, String actor) {}
