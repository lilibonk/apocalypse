package io.apocalypse.calendar.interfaces.dto.response;

public record ImportValidationIssueResp(
    long rowNumber, String column, String errorCode, String message) {}
