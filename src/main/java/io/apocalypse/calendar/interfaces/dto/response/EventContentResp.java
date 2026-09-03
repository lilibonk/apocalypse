package io.apocalypse.calendar.interfaces.dto.response;

import io.apocalypse.calendar.domain.EventTimeKind;

import java.time.LocalDate;
import java.time.LocalDateTime;

public record EventContentResp(
    String title,
    String description,
    String location,
    EventTimeKind timeKind,
    LocalDate startDate,
    LocalDate endDateExclusive,
    LocalDateTime startLocal,
    LocalDateTime endLocal,
    String zoneId,
    String startOffset,
    String endOffset) {}
