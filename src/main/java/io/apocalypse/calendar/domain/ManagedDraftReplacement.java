package io.apocalypse.calendar.domain;

import java.util.List;

public record ManagedDraftReplacement(
    Long calendarId,
    Long baselineReleaseId,
    Long sourceImportId,
    int expectedRevisionNo,
    String contentHash,
    String actor,
    List<DayOverrideOperation> operations) {}
