package io.apocalypse.calendar.interfaces.dto.response;

import io.apocalypse.calendar.domain.ConflictState;
import io.apocalypse.calendar.domain.DayField;
import io.apocalypse.calendar.domain.FieldValueState;

import io.swagger.v3.oas.annotations.media.Schema;

public record FieldResolutionResp(
    DayField field,
    FieldValueState state,
    ResolutionSourceResp source,
    @Schema(nullable = true) DayFieldValueResp underlay,
    @Schema(nullable = true) String underlayHash,
    ConflictState conflictState,
    @Schema(nullable = true) Long conflictId) {}
