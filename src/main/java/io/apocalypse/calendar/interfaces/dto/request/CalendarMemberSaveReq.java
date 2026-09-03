package io.apocalypse.calendar.interfaces.dto.request;

import io.apocalypse.calendar.domain.CalendarRole;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record CalendarMemberSaveReq(@NotNull CalendarRole role, @Min(0) int expectedVersion) {}
