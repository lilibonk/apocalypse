package io.apocalypse.calendar.interfaces.dto.response;

import io.apocalypse.calendar.domain.DataImportState;
import io.apocalypse.calendar.domain.DataImportTarget;
import io.apocalypse.calendar.domain.ImportAssuranceLevel;
import io.apocalypse.calendar.domain.ImportSourceClaim;

import java.time.LocalDate;
import java.time.LocalDateTime;

import io.swagger.v3.oas.annotations.media.Schema;

public record DataImportResp(
    Long id,
    String importKey,
    DataImportTarget targetType,
    @Schema(nullable = true) Long targetCalendarId,
    String regionCode,
    int dataYear,
    ImportSourceClaim sourceClaim,
    ImportAssuranceLevel assuranceLevel,
    @Schema(nullable = true) String documentNo,
    @Schema(nullable = true) String documentTitle,
    @Schema(nullable = true) String issuer,
    @Schema(nullable = true) LocalDate documentPublishedOn,
    @Schema(nullable = true) String sourceUri,
    DataImportState state,
    FileEvidenceResp dataFile,
    @Schema(nullable = true) FileEvidenceResp evidenceFile,
    @Schema(nullable = true) String normalizedPayloadHash,
    @Schema(nullable = true) ImportValidationResp validation,
    @Schema(nullable = true) ImportDiffResp diff,
    @Schema(nullable = true) String reviewedBy,
    @Schema(nullable = true) LocalDateTime reviewedAt,
    @Schema(nullable = true) String reviewNote,
    @Schema(nullable = true) String publishedBy,
    @Schema(nullable = true) LocalDateTime publishedAt,
    @Schema(nullable = true) Long publishedReleaseId,
    @Schema(nullable = true) Long publishedRevisionId,
    int version) {}
