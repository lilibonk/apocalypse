package io.apocalypse.calendar.domain;

public record DataImportValidationIssue(
    long rowNumber, String column, String errorCode, String message) {}
