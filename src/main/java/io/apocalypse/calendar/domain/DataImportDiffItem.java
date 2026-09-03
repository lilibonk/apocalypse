package io.apocalypse.calendar.domain;

import java.time.LocalDate;

public record DataImportDiffItem(
    LocalDate date,
    String changeType,
    OverrideAction oldAction,
    DayClassification oldClassification,
    String oldName,
    OverrideAction newAction,
    DayClassification newClassification,
    String newName) {}
