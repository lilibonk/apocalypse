package io.apocalypse.calendar.interfaces.dto.request;

import io.apocalypse.calendar.domain.CalendarState;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CalendarUpdateReq(
    @NotBlank @Size(max = 128) String name,
    @NotNull Long parentId,
    @NotBlank @Size(max = 64) String zoneId,
    @NotNull CalendarState state,
    @Min(0) int expectedVersion) {}
