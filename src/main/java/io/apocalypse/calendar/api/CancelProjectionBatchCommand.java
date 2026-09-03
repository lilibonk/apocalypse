package io.apocalypse.calendar.api;

import java.util.List;

public record CancelProjectionBatchCommand(
    String sourceSystem, String targetCalendarKey, List<CancelProjectedEventCommand> events) {}
