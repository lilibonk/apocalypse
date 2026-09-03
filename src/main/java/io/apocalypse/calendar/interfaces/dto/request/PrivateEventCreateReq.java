package io.apocalypse.calendar.interfaces.dto.request;

public record PrivateEventCreateReq(Long calendarId, EventContentReq content) {}
