package io.apocalypse.calendar.interfaces.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record DataImportReviewReq(
    int expectedVersion,
    @NotBlank String expectedDataFileSha256,
    @NotBlank String expectedNormalizedPayloadHash,
    boolean sourceAttested,
    @Size(max = 500) String reviewNote) {}
