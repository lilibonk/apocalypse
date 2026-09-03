package io.apocalypse.calendar.interfaces.dto.request;

import io.apocalypse.calendar.domain.ProjectionPublishMode;

public record ProjectionGrantSaveReq(ProjectionPublishMode publishMode, int expectedVersion) {}
