package io.apocalypse.calendar.interfaces.dto.request;

import jakarta.validation.constraints.Size;

public record DataImportRejectReq(int expectedVersion, @Size(max = 500) String reviewNote) {}
