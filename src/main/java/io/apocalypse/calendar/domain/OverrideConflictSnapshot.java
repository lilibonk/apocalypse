package io.apocalypse.calendar.domain;

import java.time.LocalDate;
import java.time.LocalDateTime;

public record OverrideConflictSnapshot(
    Long id,
    Long overrideItemId,
    Long revisionId,
    Long calendarId,
    OverrideScope scope,
    Long ownerUserId,
    LocalDate date,
    DayField field,
    OverrideConflictTrigger triggerType,
    String triggerKey,
    DayFieldValue previousUnderlay,
    DayFieldValue currentUnderlay,
    String previousHash,
    String currentHash,
    OverrideConflictRecordState state,
    LocalDateTime detectedAt,
    LocalDateTime resolvedAt,
    String resolvedBy,
    Long resolutionRevisionId) {}
