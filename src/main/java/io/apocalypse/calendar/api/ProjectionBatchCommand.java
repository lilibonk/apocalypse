package io.apocalypse.calendar.api;

import java.util.List;

public record ProjectionBatchCommand(
    String sourceSystem, String targetCalendarKey, List<ProjectedEventCommand> events) {}
