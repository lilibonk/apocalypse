package io.apocalypse.calendar.domain;

import java.time.LocalDate;

public record DayOverrideOperation(
    Long id,
    LocalDate date,
    DayField field,
    OverrideAction action,
    DayFieldValue value,
    DayFieldValue savedUnderlay,
    String savedUnderlayHash,
    DayFieldSource savedUnderlaySource,
    ConflictState persistedConflictState,
    String persistedConflictUnderlayHash,
    Long conflictId) {}
