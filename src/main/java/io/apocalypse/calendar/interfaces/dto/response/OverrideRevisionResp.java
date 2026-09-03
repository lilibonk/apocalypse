package io.apocalypse.calendar.interfaces.dto.response;

import io.apocalypse.calendar.domain.OverrideRevisionState;
import io.apocalypse.calendar.domain.OverrideScope;

import java.util.List;

public record OverrideRevisionResp(
    Long id,
    Long calendarId,
    OverrideScope scope,
    int revisionNo,
    OverrideRevisionState state,
    Long baselineReleaseId,
    String contentHash,
    int version,
    List<DayOverrideResp> items) {}
