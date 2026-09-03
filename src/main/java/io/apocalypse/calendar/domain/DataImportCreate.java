package io.apocalypse.calendar.domain;

import java.time.LocalDate;

public record DataImportCreate(
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
    Long uploaderUserId,
    String actor) {}
