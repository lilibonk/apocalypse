package io.apocalypse.calendar.interfaces.dto.request;

import io.apocalypse.calendar.domain.ConflictResolution;

public record ConflictResolutionReq(Long conflictId, ConflictResolution resolution) {}
