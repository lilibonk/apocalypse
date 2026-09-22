package io.apocalypse.calendar.interfaces.dto.response;

import io.apocalypse.calendar.domain.DayClassification;

import io.swagger.v3.oas.annotations.media.Schema;

public record DayPolicyResp(
    DayClassification classification, @Schema(nullable = true) String name) {}
