package io.apocalypse.calendar.interfaces.dto.request;

import io.apocalypse.calendar.domain.ConflictResolution;

public record ConflictResolveReq(ConflictResolution resolution, int expectedRevisionNo) {}
