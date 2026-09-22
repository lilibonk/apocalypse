package io.apocalypse.calendar.interfaces.dto.response;

import io.apocalypse.calendar.domain.EventTimeKind;

import java.time.LocalDate;
import java.time.LocalDateTime;

import io.swagger.v3.oas.annotations.media.Schema;

public record EventContentResp(
    String title,
    @Schema(nullable = true) String description,
    @Schema(nullable = true) String location,
    EventTimeKind timeKind,
    @Schema(nullable = true) LocalDate startDate,
    @Schema(nullable = true) LocalDate endDateExclusive,
    @Schema(nullable = true) LocalDateTime startLocal,
    @Schema(nullable = true) LocalDateTime endLocal,
    @Schema(nullable = true) String zoneId,
    @Schema(nullable = true) String startOffset,
    @Schema(nullable = true) String endOffset) {}
