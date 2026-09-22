package io.apocalypse.calendar.interfaces.dto.response;

import io.apocalypse.calendar.domain.DayClassification;
import io.apocalypse.calendar.domain.OverrideAction;

import java.time.LocalDate;

import io.swagger.v3.oas.annotations.media.Schema;

public record ImportDiffItemResp(
    LocalDate date,
    String changeType,
    @Schema(nullable = true) OverrideAction oldAction,
    @Schema(nullable = true) DayClassification oldClassification,
    @Schema(nullable = true) String oldName,
    @Schema(nullable = true) OverrideAction newAction,
    @Schema(nullable = true) DayClassification newClassification,
    @Schema(nullable = true) String newName) {}
