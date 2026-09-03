package io.apocalypse.calendar.domain;

import java.util.List;

public record PersonalOverrideReplacement(
    Long calendarId,
    Long ownerUserId,
    Long baselineReleaseId,
    int expectedRevisionNo,
    String contentHash,
    String actor,
    List<DayOverrideOperation> operations) {}
