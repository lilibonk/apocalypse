package io.apocalypse.calendar.interfaces.dto.response;

import io.apocalypse.calendar.domain.EventKind;
import io.apocalypse.calendar.domain.EventRevisionState;
import io.apocalypse.calendar.domain.EventSourceKind;
import io.apocalypse.calendar.domain.EventState;

public record CalendarEventResp(
    Long id,
    Long calendarId,
    EventKind eventKind,
    Long ownerUserId,
    EventSourceKind sourceKind,
    EventState state,
    int version,
    int revisionNo,
    int revisionVersion,
    EventRevisionState revisionState,
    String contentHash,
    EventContentResp content) {}
