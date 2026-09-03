package io.apocalypse.calendar.domain;

import java.time.LocalDate;

public record DataImportRow(
    LocalDate date,
    OverrideAction action,
    DayClassification classification,
    String name,
    String sourceDocumentNo,
    String note) {}
