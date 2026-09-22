package io.apocalypse.calendar.interfaces.dto.response;

import io.apocalypse.calendar.domain.SolarTerm;
import io.apocalypse.calendar.domain.Zodiac;

import io.swagger.v3.oas.annotations.media.Schema;

public record DaySnapshotResp(
    @Schema(nullable = true) LunarDateResp lunarDate,
    @Schema(nullable = true) Zodiac zodiac,
    @Schema(nullable = true) SolarTerm solarTerm,
    @Schema(nullable = true) DayPolicyResp dayPolicy,
    @Schema(nullable = true) String displayLabel,
    @Schema(nullable = true) String displayNote) {}
