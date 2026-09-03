package io.apocalypse.calendar.interfaces.dto.request;

import io.apocalypse.calendar.domain.DataImportTarget;
import io.apocalypse.calendar.domain.ImportAssuranceLevel;
import io.apocalypse.calendar.domain.ImportSourceClaim;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

public record DataImportCreateReq(
    @NotBlank @Pattern(regexp = "^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$") String importKey,
    @NotNull DataImportTarget targetType,
    Long targetCalendarId,
    @NotBlank @Size(max = 16) String regionCode,
    @Min(1901) @Max(2100) int dataYear,
    @NotNull ImportSourceClaim sourceClaim,
    @NotNull ImportAssuranceLevel assuranceLevel,
    @Size(max = 128) String documentNo,
    @Size(max = 256) String documentTitle,
    @Size(max = 128) String issuer,
    LocalDate documentPublishedOn,
    @Size(max = 500) String sourceUri) {}
