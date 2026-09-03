package io.apocalypse.calendar.interfaces.dto.request;

public record EventPublishReq(int expectedDraftVersion, String expectedContentHash) {}
