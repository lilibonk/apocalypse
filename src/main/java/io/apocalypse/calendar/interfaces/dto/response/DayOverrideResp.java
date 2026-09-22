package io.apocalypse.calendar.interfaces.dto.response;

import io.apocalypse.calendar.domain.DayField;
import io.apocalypse.calendar.domain.OverrideAction;

import java.time.LocalDate;

import io.swagger.v3.oas.annotations.media.Schema;

public record DayOverrideResp(
    Long id,
    LocalDate date,
    DayField field,
    OverrideAction action,
    @Schema(nullable = true) DayFieldValueResp value,
    DayFieldValueResp savedUnderlay,
    String savedUnderlayHash,
    ResolutionSourceResp savedUnderlaySource) {}
