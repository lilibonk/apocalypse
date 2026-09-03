package io.apocalypse.calendar.interfaces.dto.request;

import jakarta.validation.constraints.NotBlank;

public record DataImportPublishReq(
    int expectedVersion,
    @NotBlank String expectedNormalizedPayloadHash,
    @NotBlank String expectedTargetContentHash) {}
