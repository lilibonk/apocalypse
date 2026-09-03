package io.apocalypse.calendar.domain;

import java.util.List;

public record OverrideLayer(
    SourceLayer sourceLayer,
    Long calendarId,
    String calendarKey,
    String sourceVersion,
    List<DayOverrideOperation> operations) {}
