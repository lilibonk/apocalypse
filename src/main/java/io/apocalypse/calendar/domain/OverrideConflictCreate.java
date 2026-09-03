package io.apocalypse.calendar.domain;

public record OverrideConflictCreate(
    Long overrideItemId,
    OverrideConflictTrigger triggerType,
    String triggerKey,
    DayFieldValue previousUnderlay,
    DayFieldValue currentUnderlay,
    String previousHash,
    String currentHash,
    String actor) {}
