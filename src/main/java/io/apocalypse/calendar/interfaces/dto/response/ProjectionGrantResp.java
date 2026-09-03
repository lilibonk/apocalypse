package io.apocalypse.calendar.interfaces.dto.response;

import io.apocalypse.calendar.domain.ProjectionGrantState;
import io.apocalypse.calendar.domain.ProjectionPublishMode;

public record ProjectionGrantResp(
    Long id,
    Long calendarId,
    String sourceSystem,
    ProjectionPublishMode publishMode,
    ProjectionGrantState state,
    int version) {}
