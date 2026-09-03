package io.apocalypse.calendar.domain;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public record DataImportSnapshot(
    Long id,
    String importKey,
    DataImportTarget target,
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
    ImportFileEvidence dataFile,
    ImportFileEvidence evidenceFile,
    List<DataImportRow> rows,
    String normalizedPayloadHash,
    DataImportValidation validation,
    DataImportDiff diff,
    DataImportState state,
    LocalDateTime reviewedAt,
    String reviewedBy,
    String reviewNote,
    LocalDateTime publishedAt,
    String publishedBy,
    Long publishedReleaseId,
    Long publishedRevisionId,
    int version) {

  public DataImportSnapshot {
    rows = rows == null ? List.of() : List.copyOf(rows);
  }
}
