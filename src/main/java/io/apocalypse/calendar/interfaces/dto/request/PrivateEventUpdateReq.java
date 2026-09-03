package io.apocalypse.calendar.interfaces.dto.request;

public record PrivateEventUpdateReq(
    Long calendarId, int expectedVersion, EventContentReq content) {}
