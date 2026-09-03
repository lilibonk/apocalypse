package io.apocalypse.calendar.interfaces.dto.request;

public record ManagedEventDraftSaveReq(int expectedDraftVersion, EventContentReq content) {}
