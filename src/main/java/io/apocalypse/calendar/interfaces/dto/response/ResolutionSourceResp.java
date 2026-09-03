package io.apocalypse.calendar.interfaces.dto.response;

import io.apocalypse.calendar.domain.OverrideAction;
import io.apocalypse.calendar.domain.SourceLayer;

public record ResolutionSourceResp(
    SourceLayer layer,
    Long sourceCalendarId,
    String sourceCalendarKey,
    String sourceVersion,
    OverrideAction action) {}
