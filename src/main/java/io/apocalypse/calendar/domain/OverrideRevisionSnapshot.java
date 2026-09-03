package io.apocalypse.calendar.domain;

import java.util.List;

public record OverrideRevisionSnapshot(
    Long id,
    Long calendarId,
    OverrideScope scope,
    Long ownerUserId,
    int revisionNo,
    OverrideRevisionState state,
    Long baselineReleaseId,
    String contentHash,
    int version,
    List<DayOverrideOperation> operations) {}
