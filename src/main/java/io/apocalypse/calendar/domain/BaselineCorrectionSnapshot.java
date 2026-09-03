package io.apocalypse.calendar.domain;

import java.time.LocalDate;

public record BaselineCorrectionSnapshot(
    LocalDate date,
    DayField field,
    OverrideAction action,
    DayFieldValue value,
    String sourceUri,
    String reason,
    Long sourceImportId) {}
