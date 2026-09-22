package io.apocalypse.calendar.interfaces.dto.response;

import io.apocalypse.calendar.domain.DayField;
import io.apocalypse.calendar.domain.OverrideConflictRecordState;
import io.apocalypse.calendar.domain.OverrideConflictTrigger;
import io.apocalypse.calendar.domain.OverrideScope;

import java.time.LocalDate;
import java.time.LocalDateTime;

import io.swagger.v3.oas.annotations.media.Schema;

public record OverrideConflictResp(
    Long id,
    Long overrideItemId,
    Long calendarId,
    OverrideScope scope,
    LocalDate date,
    DayField field,
    OverrideConflictTrigger triggerType,
    String triggerKey,
    DayFieldValueResp previousUnderlay,
    DayFieldValueResp currentUnderlay,
    String previousHash,
    String currentHash,
    OverrideConflictRecordState state,
    LocalDateTime detectedAt,
    @Schema(nullable = true) LocalDateTime resolvedAt,
    @Schema(nullable = true) String resolvedBy,
    @Schema(nullable = true) Long resolutionRevisionId) {}
