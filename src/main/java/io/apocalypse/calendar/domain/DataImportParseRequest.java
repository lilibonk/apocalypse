package io.apocalypse.calendar.domain;

public record DataImportParseRequest(
    byte[] bytes, DataImportTarget target, int dataYear, String expectedDocumentNo) {}
