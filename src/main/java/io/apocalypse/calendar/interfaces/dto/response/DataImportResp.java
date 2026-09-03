package io.apocalypse.calendar.interfaces.dto.response;

import io.apocalypse.calendar.domain.DataImportState;
import io.apocalypse.calendar.domain.DataImportTarget;
import io.apocalypse.calendar.domain.ImportAssuranceLevel;
import io.apocalypse.calendar.domain.ImportSourceClaim;

import java.time.LocalDate;
import java.time.LocalDateTime;

public record DataImportResp(
    Long id,
    String importKey,
    DataImportTarget targetType,
    Long targetCalendarId,
    String regionCode,
    int dataYear,
    ImportSourceClaim sourceClaim,
    ImportAssuranceLevel assuranceLevel,
    String documentNo,
    String documentTitle,
    String issuer,
    LocalDate documentPublishedOn,
    String sourceUri,
    DataImportState state,
    FileEvidenceResp dataFile,
    FileEvidenceResp evidenceFile,
    String normalizedPayloadHash,
    ImportValidationResp validation,
    ImportDiffResp diff,
    String reviewedBy,
    LocalDateTime reviewedAt,
    String reviewNote,
    String publishedBy,
    LocalDateTime publishedAt,
    Long publishedReleaseId,
    Long publishedRevisionId,
    int version) {}
