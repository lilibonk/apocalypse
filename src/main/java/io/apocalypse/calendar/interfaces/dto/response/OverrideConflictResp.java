package io.apocalypse.calendar.interfaces.dto.response;

import io.apocalypse.calendar.domain.DayField;
import io.apocalypse.calendar.domain.OverrideConflictRecordState;
import io.apocalypse.calendar.domain.OverrideConflictTrigger;
import io.apocalypse.calendar.domain.OverrideScope;

import java.time.LocalDate;
import java.time.LocalDateTime;

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
    LocalDateTime resolvedAt,
    String resolvedBy,
    Long resolutionRevisionId) {}
