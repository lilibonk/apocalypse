package io.apocalypse.calendar.infrastructure.persistence;

import io.apocalypse.calendar.domain.DataImportCreate;
import io.apocalypse.calendar.domain.DataImportDiff;
import io.apocalypse.calendar.domain.DataImportRepository;
import io.apocalypse.calendar.domain.DataImportRow;
import io.apocalypse.calendar.domain.DataImportSnapshot;
import io.apocalypse.calendar.domain.DataImportState;
import io.apocalypse.calendar.domain.DataImportStoragePolicy;
import io.apocalypse.calendar.domain.DataImportStorageUsage;
import io.apocalypse.calendar.domain.DataImportTarget;
import io.apocalypse.calendar.domain.DataImportValidation;
import io.apocalypse.calendar.domain.ImportAssuranceLevel;
import io.apocalypse.calendar.domain.ImportFileEvidence;
import io.apocalypse.calendar.domain.ImportSourceClaim;
import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.exception.ConcurrencyGuard;
import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.common.response.PageResult;

import java.util.List;
import java.util.Optional;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Repository;

import lombok.RequiredArgsConstructor;

@Repository
@RequiredArgsConstructor
public class MybatisDataImportRepository implements DataImportRepository {

  private final DataImportMapper mapper;

  private final DataImportJsonCodec jsonCodec;

  @Override
  public void lockStorageQuota() {
    mapper.lockStorageQuota();
  }

  @Override
  public DataImportStorageUsage storageUsage(
      Long uploaderUserId, DataImportTarget target, Long targetCalendarId, String regionCode) {
    DataImportStorageUsageDo value =
        mapper.selectStorageUsage(
            uploaderUserId,
            target.name(),
            targetCalendarId,
            regionCode,
            DataImportStoragePolicy.RECORD_OVERHEAD_BYTES);
    return new DataImportStorageUsage(
        value.getTotalChargeBytes(), value.getUploaderChargeBytes(), value.getTargetChargeBytes());
  }

  @Override
  public DataImportSnapshot create(DataImportCreate command) {
    DataImportDo value = toDo(command);
    try {
      mapper.insert(value);
    } catch (DuplicateKeyException e) {
      throw new BizException(ErrorCode.CONFLICT);
    }
    return findById(value.getId())
        .orElseThrow(() -> new IllegalStateException("Calendar 导入创建后无法回读"));
  }

  @Override
  public Optional<DataImportSnapshot> findById(Long id) {
    return Optional.ofNullable(mapper.selectById(id)).map(this::toSnapshot);
  }

  @Override
  public DataImportSnapshot findByIdForUpdate(Long id) {
    DataImportDo value = mapper.selectByIdForUpdate(id);
    return value == null ? null : toSnapshot(value);
  }

  @Override
  public PageResult<DataImportSnapshot> pageVisible(Long userId, int page, int size) {
    return mapper.pageVisible(userId, page, size).map(this::toSnapshot);
  }

  @Override
  public void saveValidation(
      Long id,
      int expectedVersion,
      List<DataImportRow> rows,
      String normalizedPayloadHash,
      DataImportValidation validation,
      DataImportDiff diff,
      DataImportState state,
      String actor) {
    ConcurrencyGuard.requireSingleRow(
        mapper.updateValidation(
            id,
            expectedVersion,
            rows.isEmpty() ? null : jsonCodec.writeRows(rows),
            normalizedPayloadHash,
            jsonCodec.writeValidation(validation),
            jsonCodec.writeDiff(diff),
            state.name(),
            actor));
  }

  @Override
  public void review(
      Long id, int expectedVersion, DataImportDiff diff, String reviewNote, String actor) {
    ConcurrencyGuard.requireSingleRow(
        mapper.review(id, expectedVersion, jsonCodec.writeDiff(diff), reviewNote, actor));
  }

  @Override
  public void reject(Long id, int expectedVersion, String reviewNote, String actor) {
    ConcurrencyGuard.requireSingleRow(mapper.reject(id, expectedVersion, reviewNote, actor));
  }

  @Override
  public void markPublished(
      Long id, int expectedVersion, Long releaseId, Long revisionId, String actor) {
    ConcurrencyGuard.requireSingleRow(
        mapper.markPublished(id, expectedVersion, releaseId, revisionId, actor));
  }

  private DataImportSnapshot toSnapshot(DataImportDo value) {
    return new DataImportSnapshot(
        value.getId(),
        value.getImportKey(),
        DataImportTarget.valueOf(value.getTargetType()),
        value.getTargetCalendarId(),
        value.getRegionCode(),
        value.getDataYear(),
        ImportSourceClaim.valueOf(value.getSourceClaim()),
        ImportAssuranceLevel.valueOf(value.getAssuranceLevel()),
        value.getDocumentNo(),
        value.getDocumentTitle(),
        value.getIssuer(),
        value.getDocumentPublishedOn(),
        value.getSourceUri(),
        dataFile(value),
        evidenceFile(value),
        jsonCodec.readRows(value.getNormalizedPayload()),
        value.getNormalizedPayloadHash(),
        jsonCodec.readValidation(value.getValidationReport()),
        jsonCodec.readDiff(value.getDiffReport()),
        DataImportState.valueOf(value.getState()),
        value.getReviewedAt(),
        value.getReviewedBy(),
        value.getReviewNote(),
        value.getPublishedAt(),
        value.getPublishedBy(),
        value.getPublishedReleaseId(),
        value.getPublishedRevisionId(),
        value.getVersion());
  }

  private static DataImportDo toDo(DataImportCreate command) {
    DataImportDo value = new DataImportDo();
    value.setImportKey(command.importKey());
    value.setUploaderUserId(command.uploaderUserId());
    value.setTargetType(command.target().name());
    value.setTargetCalendarId(command.targetCalendarId());
    value.setRegionCode(command.regionCode());
    value.setDataYear(command.dataYear());
    value.setSourceClaim(command.sourceClaim().name());
    value.setAssuranceLevel(command.assuranceLevel().name());
    value.setDocumentNo(command.documentNo());
    value.setDocumentTitle(command.documentTitle());
    value.setIssuer(command.issuer());
    value.setDocumentPublishedOn(command.documentPublishedOn());
    value.setSourceUri(command.sourceUri());
    applyDataFile(value, command.dataFile());
    applyEvidenceFile(value, command.evidenceFile());
    value.setState(DataImportState.UPLOADED.name());
    value.setCreateBy(command.actor());
    value.setUpdateBy(command.actor());
    return value;
  }

  private static void applyDataFile(DataImportDo value, ImportFileEvidence file) {
    value.setDataFileName(file.fileName());
    value.setDataContentType(file.contentType());
    value.setDataFileSize(file.size());
    value.setDataFileSha256(file.sha256());
    value.setDataFileBytes(file.bytes());
  }

  private static void applyEvidenceFile(DataImportDo value, ImportFileEvidence file) {
    if (file == null) {
      return;
    }
    value.setEvidenceFileName(file.fileName());
    value.setEvidenceContentType(file.contentType());
    value.setEvidenceFileSize(file.size());
    value.setEvidenceFileSha256(file.sha256());
    value.setEvidenceFileBytes(file.bytes());
  }

  private static ImportFileEvidence dataFile(DataImportDo value) {
    return new ImportFileEvidence(
        value.getDataFileName(),
        value.getDataContentType(),
        value.getDataFileSize(),
        value.getDataFileSha256(),
        value.getDataFileBytes());
  }

  private static ImportFileEvidence evidenceFile(DataImportDo value) {
    if (value.getEvidenceFileName() == null) {
      return null;
    }
    return new ImportFileEvidence(
        value.getEvidenceFileName(),
        value.getEvidenceContentType(),
        value.getEvidenceFileSize(),
        value.getEvidenceFileSha256(),
        value.getEvidenceFileBytes());
  }
}
