package io.apocalypse.calendar.interfaces.dto.request;

import java.util.List;

public record OverridePublishReq(
    int expectedDraftVersion,
    String expectedContentHash,
    List<ConflictResolutionReq> conflictResolutions) {}
