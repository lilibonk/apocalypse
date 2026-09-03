package io.apocalypse.calendar.domain;

import java.time.LocalDate;
import java.time.LocalDateTime;

public record EventContent(
    String title,
    String description,
    String location,
    EventTimeKind timeKind,
    LocalDate startDate,
    LocalDate endDateExclusive,
    LocalDateTime startAtUtc,
    LocalDateTime endAtUtc,
    String zoneId) {}
