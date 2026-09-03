package io.apocalypse.calendar.interfaces.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record CalendarCreateReq(
    @NotBlank @Pattern(regexp = "[a-z][a-z0-9-]{0,63}") String calendarKey,
    @NotBlank @Size(max = 128) String name,
    @NotNull Long parentId,
    @NotBlank @Size(max = 16) String regionCode,
    @NotBlank @Size(max = 64) String zoneId) {}
