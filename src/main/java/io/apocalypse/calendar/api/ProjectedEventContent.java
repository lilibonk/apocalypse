package io.apocalypse.calendar.api;

import java.time.Instant;
import java.time.LocalDate;

public record ProjectedEventContent(
    String title,
    String description,
    String location,
    ProjectionTimeKind timeKind,
    LocalDate startDate,
    LocalDate endDateExclusive,
    Instant startInstant,
    Instant endInstant,
    String zoneId) {}
