package io.apocalypse.calendar.application;

import io.apocalypse.calendar.domain.DataImportDiff;
import io.apocalypse.calendar.domain.DataImportSnapshot;
import io.apocalypse.calendar.domain.DataImportValidation;
import io.apocalypse.calendar.domain.ImportFileEvidence;
import io.apocalypse.calendar.interfaces.dto.response.DataImportResp;
import io.apocalypse.calendar.interfaces.dto.response.FileEvidenceResp;
import io.apocalypse.calendar.interfaces.dto.response.ImportDiffItemResp;
import io.apocalypse.calendar.interfaces.dto.response.ImportDiffResp;
import io.apocalypse.calendar.interfaces.dto.response.ImportValidationIssueResp;
import io.apocalypse.calendar.interfaces.dto.response.ImportValidationResp;

final class DataImportResponseMapper {

  private DataImportResponseMapper() {}

  static DataImportResp toResponse(DataImportSnapshot value) {
    return new DataImportResp(
        value.id(),
        value.importKey(),
        value.target(),
        value.targetCalendarId(),
        value.regionCode(),
        value.dataYear(),
        value.sourceClaim(),
        value.assuranceLevel(),
        value.documentNo(),
        value.documentTitle(),
        value.issuer(),
        value.documentPublishedOn(),
        value.sourceUri(),
        value.state(),
        file(value.dataFile()),
        file(value.evidenceFile()),
        value.normalizedPayloadHash(),
        validation(value.validation()),
        diff(value.diff()),
        value.reviewedBy(),
        value.reviewedAt(),
        value.reviewNote(),
        value.publishedBy(),
        value.publishedAt(),
        value.publishedReleaseId(),
        value.publishedRevisionId(),
        value.version());
  }

  static ImportDiffResp diff(DataImportDiff value) {
    if (value == null) {
      return null;
    }
    return new ImportDiffResp(
        value.added(),
        value.modified(),
        value.inherited(),
        value.unchanged(),
        value.conflicts(),
        value.targetContentHash(),
        value.items().stream()
            .map(
                item ->
                    new ImportDiffItemResp(
                        item.date(),
                        item.changeType(),
                        item.oldAction(),
                        item.oldClassification(),
                        item.oldName(),
                        item.newAction(),
                        item.newClassification(),
                        item.newName()))
            .toList());
  }

  private static FileEvidenceResp file(ImportFileEvidence value) {
    return value == null
        ? null
        : new FileEvidenceResp(value.fileName(), value.contentType(), value.size(), value.sha256());
  }

  private static ImportValidationResp validation(DataImportValidation value) {
    if (value == null) {
      return null;
    }
    return new ImportValidationResp(
        value.valid(),
        value.rowCount(),
        value.validatorVersion(),
        value.issues().stream()
            .map(
                issue ->
                    new ImportValidationIssueResp(
                        issue.rowNumber(), issue.column(), issue.errorCode(), issue.message()))
            .toList());
  }
}
