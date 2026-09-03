package io.apocalypse.calendar.interfaces.dto.response;

import io.apocalypse.calendar.domain.ConflictState;
import io.apocalypse.calendar.domain.DayField;
import io.apocalypse.calendar.domain.FieldValueState;

public record FieldResolutionResp(
    DayField field,
    FieldValueState state,
    ResolutionSourceResp source,
    DayFieldValueResp underlay,
    String underlayHash,
    ConflictState conflictState,
    Long conflictId) {}
