package io.apocalypse.calendar.interfaces.dto.request;

import io.apocalypse.calendar.domain.DstOffsetChoice;
import io.apocalypse.calendar.domain.EventTimeKind;

import java.time.LocalDate;
import java.time.LocalDateTime;

public record EventContentReq(
    String title,
    String description,
    String location,
    EventTimeKind timeKind,
    LocalDate startDate,
    LocalDate endDateExclusive,
    LocalDateTime startLocal,
    LocalDateTime endLocal,
    String zoneId,
    DstOffsetChoice startOffsetChoice,
    DstOffsetChoice endOffsetChoice) {}
