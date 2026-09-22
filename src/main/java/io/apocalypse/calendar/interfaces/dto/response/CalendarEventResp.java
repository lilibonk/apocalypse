package io.apocalypse.calendar.interfaces.dto.response;

import io.apocalypse.calendar.domain.EventKind;
import io.apocalypse.calendar.domain.EventRevisionState;
import io.apocalypse.calendar.domain.EventSourceKind;
import io.apocalypse.calendar.domain.EventState;

import io.swagger.v3.oas.annotations.media.Schema;

public record CalendarEventResp(
    Long id,
    Long calendarId,
    EventKind eventKind,
    @Schema(nullable = true) Long ownerUserId,
    EventSourceKind sourceKind,
    EventState state,
    int version,
    int revisionNo,
    int revisionVersion,
    EventRevisionState revisionState,
    String contentHash,
    EventContentResp content) {}
