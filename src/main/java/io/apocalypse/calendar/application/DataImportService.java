package io.apocalypse.calendar.application;

import io.apocalypse.calendar.api.CalendarErrorCode;
import io.apocalypse.calendar.domain.BaselineContentHasher;
import io.apocalypse.calendar.domain.BaselineCorrectionSnapshot;
import io.apocalypse.calendar.domain.BaselineImportPublication;
import io.apocalypse.calendar.domain.BaselineReleaseRepository;
import io.apocalypse.calendar.domain.BaselineReleaseSnapshot;
import io.apocalypse.calendar.domain.CalendarContext;
import io.apocalypse.calendar.domain.CalendarContextRepository;
import io.apocalypse.calendar.domain.CalendarKind;
import io.apocalypse.calendar.domain.CalendarRole;
import io.apocalypse.calendar.domain.DataImportCreate;
import io.apocalypse.calendar.domain.DataImportDiff;
import io.apocalypse.calendar.domain.DataImportParseRequest;
import io.apocalypse.calendar.domain.DataImportParseResult;
import io.apocalypse.calendar.domain.DataImportParser;
import io.apocalypse.calendar.domain.DataImportRepository;
import io.apocalypse.calendar.domain.DataImportRow;
import io.apocalypse.calendar.domain.DataImportSnapshot;
import io.apocalypse.calendar.domain.DataImportState;
import io.apocalypse.calendar.domain.DataImportStoragePolicy;
import io.apocalypse.calendar.domain.DataImportTarget;
import io.apocalypse.calendar.domain.DayField;
import io.apocalypse.calendar.domain.DayFieldValue;
import io.apocalypse.calendar.domain.DayOverrideOperation;
import io.apocalypse.calendar.domain.DayPolicyValue;
import io.apocalypse.calendar.domain.ImportAssuranceLevel;
import io.apocalypse.calendar.domain.ImportFileEvidence;
import io.apocalypse.calendar.domain.ImportSourceClaim;
import io.apocalypse.calendar.domain.ManagedDraftPublish;
import io.apocalypse.calendar.domain.ManagedDraftReplacement;
import io.apocalypse.calendar.domain.OverrideAction;
import io.apocalypse.calendar.domain.OverrideContentHasher;
import io.apocalypse.calendar.domain.OverrideRevisionRepository;
import io.apocalypse.calendar.domain.OverrideRevisionSnapshot;
import io.apocalypse.calendar.domain.OverrideScope;
import io.apocalypse.calendar.domain.ResolvedDayField;
import io.apocalypse.calendar.interfaces.dto.request.DataImportCreateReq;
import io.apocalypse.calendar.interfaces.dto.request.DataImportPublishReq;
import io.apocalypse.calendar.interfaces.dto.request.DataImportRejectReq;
import io.apocalypse.calendar.interfaces.dto.request.DataImportReviewReq;
import io.apocalypse.calendar.interfaces.dto.request.DayFieldOperationReq;
import io.apocalypse.calendar.interfaces.dto.request.DayFieldValueReq;
import io.apocalypse.calendar.interfaces.dto.request.DayPolicyReq;
import io.apocalypse.calendar.interfaces.dto.response.DataImportResp;
import io.apocalypse.calendar.interfaces.dto.response.ImportDiffResp;
import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.common.response.PageResult;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class DataImportService {

  private final CalendarCapabilityGuard capabilityGuard;

  private final CalendarAccessService calendarAccessService;

  private final CalendarContextRepository calendarContextRepository;

  private final DataImportRepository dataImportRepository;

  private final DataImportParser dataImportParser;

  private final DataImportDiffService diffService;

  private final CalendarImportStorageGuard storageGuard;

  private final BaselineReleaseRepository baselineReleaseRepository;

  private final OverrideRevisionRepository overrideRevisionRepository;

  private final DateQueryService dateQueryService;

  @Transactional(readOnly = true)
  public PageResult<DataImportResp> page(int page, int size, Long userId) {
    capabilityGuard.requireEnabled();
    return dataImportRepository
        .pageVisible(userId, page, size)
        .map(DataImportResponseMapper::toResponse);
  }

  @Transactional(readOnly = true)
  public DataImportResp detail(Long id, Long userId) {
    capabilityGuard.requireEnabled();
    DataImportSnapshot value = require(id);
    requireAccess(value, userId, CalendarRole.EDITOR);
    return DataImportResponseMapper.toResponse(value);
  }

  @Transactional
  public DataImportResp upload(
      DataImportCreateReq request,
      ImportUploadFile dataFile,
      ImportUploadFile evidenceFile,
      Long userId,
      String actor) {
    capabilityGuard.requireEnabled();
    requireMetadata(request, userId, CalendarRole.EDITOR);
    ImportFileEvidence data = DataImportFilePolicy.data(dataFile);
    ImportFileEvidence evidence = DataImportFilePolicy.evidence(evidenceFile);
    long incomingBytes =
        DataImportStoragePolicy.charge(data.size() + (evidence == null ? 0 : evidence.size()));
    dataImportRepository.lockStorageQuota();
    storageGuard.requireCapacity(
        dataImportRepository.storageUsage(
            userId, request.targetType(), request.targetCalendarId(), request.regionCode().strip()),
        incomingBytes);
    DataImportSnapshot created =
        dataImportRepository.create(
            new DataImportCreate(
                request.importKey().strip(),
                request.targetType(),
                request.targetCalendarId(),
                request.regionCode().strip(),
                request.dataYear(),
                request.sourceClaim(),
                request.assuranceLevel(),
                normalize(request.documentNo()),
                normalize(request.documentTitle()),
                normalize(request.issuer()),
                request.documentPublishedOn(),
                normalize(request.sourceUri()),
                data,
                evidence,
                userId,
                actor));
    return DataImportResponseMapper.toResponse(created);
  }

  @Transactional
  public DataImportResp validate(Long id, Long userId, String actor) {
    capabilityGuard.requireEnabled();
    DataImportSnapshot value = requireLocked(id);
    requireAccess(value, userId, CalendarRole.EDITOR);
    requireState(value, DataImportState.UPLOADED);
    requireStoredFileHash(value);
    DataImportParseResult parsed = parse(value);
    DataImportDiff diff = parsed.validation().valid() ? diff(value, parsed.rows(), userId) : null;
    DataImportState state =
        parsed.validation().valid() ? DataImportState.VALIDATED : DataImportState.INVALID;
    dataImportRepository.saveValidation(
        value.id(),
        value.version(),
        parsed.rows(),
        parsed.normalizedPayloadHash(),
        parsed.validation(),
        diff,
        state,
        actor);
    return DataImportResponseMapper.toResponse(require(value.id()));
  }

  @Transactional(readOnly = true)
  public ImportDiffResp diff(Long id, Long userId) {
    capabilityGuard.requireEnabled();
    DataImportSnapshot value = require(id);
    requireAccess(value, userId, CalendarRole.EDITOR);
    if (value.state() == DataImportState.REVIEWED || value.state() == DataImportState.PUBLISHED) {
      return DataImportResponseMapper.diff(value.diff());
    }
    requireState(value, DataImportState.VALIDATED);
    return DataImportResponseMapper.diff(diffService.compute(value, userId));
  }

  @Transactional
  public DataImportResp review(Long id, DataImportReviewReq request, Long userId, String actor) {
    capabilityGuard.requireEnabled();
    if (request == null || !request.sourceAttested()) {
      throw sourceEvidenceRequired();
    }
    DataImportSnapshot value = requireLocked(id);
    requireAccess(value, userId, CalendarRole.PUBLISHER);
    requireState(value, DataImportState.VALIDATED);
    if (request.expectedVersion() != value.version()
        || !Objects.equals(request.expectedDataFileSha256(), value.dataFile().sha256())
        || !Objects.equals(
            request.expectedNormalizedPayloadHash(), value.normalizedPayloadHash())) {
      throw new BizException(ErrorCode.CONFLICT);
    }
    DataImportParseResult parsed = requireImmutablePayload(value);
    DataImportDiff diff = diff(value, parsed.rows(), userId);
    dataImportRepository.review(
        value.id(), value.version(), diff, normalize(request.reviewNote()), actor);
    return DataImportResponseMapper.toResponse(require(value.id()));
  }

  @Transactional
  public DataImportResp publish(Long id, DataImportPublishReq request, Long userId, String actor) {
    capabilityGuard.requireEnabled();
    if (request == null) {
      throw new BizException(ErrorCode.PARAM_INVALID);
    }
    DataImportSnapshot value = requireLocked(id);
    requireAccess(value, userId, CalendarRole.PUBLISHER);
    requireState(value, DataImportState.REVIEWED);
    if (request.expectedVersion() != value.version()
        || !Objects.equals(
            request.expectedNormalizedPayloadHash(), value.normalizedPayloadHash())) {
      throw new BizException(ErrorCode.CONFLICT);
    }
    DataImportParseResult parsed = requireImmutablePayload(value);
    BaselineReleaseSnapshot lockedBaseline = lockPublicationTarget(value);
    DataImportDiff currentDiff = diff(value, parsed.rows(), userId);
    String reviewedTargetContentHash =
        value.diff() == null ? null : value.diff().targetContentHash();
    if (!Objects.equals(request.expectedTargetContentHash(), reviewedTargetContentHash)
        || !Objects.equals(reviewedTargetContentHash, currentDiff.targetContentHash())) {
      throw new BizException(ErrorCode.CONFLICT);
    }
    PublicationResult result =
        value.target() == DataImportTarget.SYSTEM_BASELINE
            ? publishSystem(value, parsed.rows(), actor, lockedBaseline)
            : publishManaged(value, parsed.rows(), userId, actor, currentDiff);
    dataImportRepository.markPublished(
        value.id(), value.version(), result.releaseId(), result.revisionId(), actor);
    return DataImportResponseMapper.toResponse(require(value.id()));
  }

  @Transactional
  public DataImportResp reject(Long id, DataImportRejectReq request, Long userId, String actor) {
    capabilityGuard.requireEnabled();
    if (request == null) {
      throw new BizException(ErrorCode.PARAM_INVALID);
    }
    DataImportSnapshot value = requireLocked(id);
    requireAccess(value, userId, CalendarRole.PUBLISHER);
    if (request.expectedVersion() != value.version()
        || value.state() == DataImportState.PUBLISHED
        || value.state() == DataImportState.REJECTED) {
      throw importStateInvalid();
    }
    dataImportRepository.reject(
        value.id(), value.version(), normalize(request.reviewNote()), actor);
    return DataImportResponseMapper.toResponse(require(value.id()));
  }

  @Transactional(readOnly = true)
  public ImportDownload dataFile(Long id, Long userId) {
    DataImportSnapshot value = require(id);
    requireAccess(value, userId, CalendarRole.EDITOR);
    return download(value.dataFile());
  }

  @Transactional(readOnly = true)
  public ImportDownload evidenceFile(Long id, Long userId) {
    DataImportSnapshot value = require(id);
    requireAccess(value, userId, CalendarRole.EDITOR);
    if (value.evidenceFile() == null) {
      throw new BizException(ErrorCode.NOT_FOUND);
    }
    return download(value.evidenceFile());
  }

  public byte[] template(DataImportTarget target, int year) {
    capabilityGuard.requireEnabled();
    if (target == null || year < 1901 || year > 2100) {
      throw new BizException(ErrorCode.PARAM_INVALID);
    }
    String classification =
        target == DataImportTarget.SYSTEM_BASELINE ? "OFFICIAL_REST" : "CUSTOM_REST";
    String document = target == DataImportTarget.SYSTEM_BASELINE ? "示例文号" : "";
    String csv =
        "\ufeffdate,action,classification,name,source_document_no,note\r\n"
            + year
            + "-01-01,SET,"
            + classification
            + ",元旦,"
            + document
            + ",\r\n";
    return csv.getBytes(StandardCharsets.UTF_8);
  }

  private PublicationResult publishSystem(
      DataImportSnapshot value,
      List<DataImportRow> rows,
      String actor,
      BaselineReleaseSnapshot current) {
    requireSystemSource(value);
    List<BaselineCorrectionSnapshot> imported =
        rows.stream()
            .map(
                row ->
                    new BaselineCorrectionSnapshot(
                        row.date(),
                        DayField.DAY_POLICY,
                        OverrideAction.SET,
                        DayFieldValue.dayPolicy(
                            new DayPolicyValue(row.classification(), row.name())),
                        "import:" + value.importKey(),
                        sourceReason(value),
                        value.id()))
            .toList();
    List<BaselineCorrectionSnapshot> combined =
        java.util.stream.Stream.concat(
                baselineReleaseRepository.findCorrections(current.id()).stream()
                    .filter(correction -> correction.date().getYear() != value.dataYear()),
                imported.stream())
            .sorted(
                Comparator.comparing(BaselineCorrectionSnapshot::date)
                    .thenComparing(correction -> correction.field().name()))
            .toList();
    String releaseKey = releaseKey(value);
    BaselineReleaseSnapshot published =
        baselineReleaseRepository.publishImport(
            new BaselineImportPublication(
                current.id(),
                releaseKey,
                value.id(),
                value.dataYear(),
                BaselineContentHasher.hash(current, combined),
                "import:" + value.importKey(),
                sourceReason(value),
                actor,
                imported));
    return new PublicationResult(published.id(), null);
  }

  private PublicationResult publishManaged(
      DataImportSnapshot value,
      List<DataImportRow> rows,
      Long userId,
      String actor,
      DataImportDiff currentDiff) {
    if (currentDiff.conflicts() > 0) {
      CalendarErrorCode error = CalendarErrorCode.CALENDAR_CONFLICT_REVIEW_REQUIRED;
      throw new BizException(error.getCode(), error.getMessage());
    }
    if (overrideRevisionRepository.findDraftManaged(value.targetCalendarId()).isPresent()) {
      throw new BizException(ErrorCode.CONFLICT);
    }
    OverrideRevisionSnapshot current =
        overrideRevisionRepository
            .findPublished(value.targetCalendarId(), OverrideScope.MANAGED, null)
            .orElse(null);
    Map<OperationKey, DayOverrideOperation> operations = new HashMap<>();
    if (current != null) {
      current
          .operations()
          .forEach(
              operation ->
                  operations.put(new OperationKey(operation.date(), operation.field()), operation));
    }
    for (DataImportRow row : rows) {
      ResolvedDayField underlay =
          dateQueryService
              .managedUnderlay(value.targetCalendarId(), row.date(), userId)
              .get(DayField.DAY_POLICY);
      DayFieldValueReq fieldValue =
          row.action() == OverrideAction.SET
              ? new DayFieldValueReq(
                  null, null, null, new DayPolicyReq(row.classification(), row.name()), null)
              : null;
      DayFieldOperationReq request =
          new DayFieldOperationReq(DayField.DAY_POLICY, row.action(), fieldValue);
      operations.put(
          new OperationKey(row.date(), DayField.DAY_POLICY),
          DayOverrideCommandFactory.create(row.date(), request, underlay));
    }
    DayOverrideCommandFactory.requireSnapshotSize(operations.size());
    List<DayOverrideOperation> snapshot =
        operations.values().stream()
            .sorted(
                Comparator.comparing(DayOverrideOperation::date)
                    .thenComparing(operation -> operation.field().name()))
            .toList();
    CalendarContext calendar =
        calendarContextRepository
            .findById(value.targetCalendarId())
            .orElseThrow(DataImportService::notFound);
    BaselineReleaseSnapshot release =
        baselineReleaseRepository
            .findPublished(calendar.regionCode())
            .orElseThrow(DataImportService::baselineUnavailable);
    int expectedRevisionNo = current == null ? 0 : current.revisionNo();
    OverrideRevisionSnapshot draft =
        overrideRevisionRepository.replaceManagedDraft(
            new ManagedDraftReplacement(
                value.targetCalendarId(),
                release.id(),
                value.id(),
                expectedRevisionNo,
                OverrideContentHasher.hash(snapshot),
                actor,
                snapshot));
    OverrideRevisionSnapshot published =
        overrideRevisionRepository.publishManagedDraft(
            new ManagedDraftPublish(
                value.targetCalendarId(), draft.version(), draft.contentHash(), actor));
    return new PublicationResult(null, published.id());
  }

  private BaselineReleaseSnapshot lockPublicationTarget(DataImportSnapshot value) {
    if (value.target() == DataImportTarget.SYSTEM_BASELINE) {
      baselineReleaseRepository.lockPublicationScope(value.regionCode());
      return baselineReleaseRepository
          .findPublished(value.regionCode())
          .orElseThrow(DataImportService::baselineUnavailable);
    }
    overrideRevisionRepository.lockManagedScope(value.targetCalendarId());
    return null;
  }

  private DataImportParseResult requireImmutablePayload(DataImportSnapshot value) {
    requireStoredFileHash(value);
    DataImportParseResult parsed = parse(value);
    if (!parsed.validation().valid()
        || !Objects.equals(parsed.normalizedPayloadHash(), value.normalizedPayloadHash())
        || !Objects.equals(parsed.rows(), value.rows())) {
      throw new BizException(ErrorCode.CONFLICT);
    }
    return parsed;
  }

  private DataImportParseResult parse(DataImportSnapshot value) {
    return dataImportParser.parse(
        new DataImportParseRequest(
            value.dataFile().bytes(), value.target(), value.dataYear(), value.documentNo()));
  }

  private DataImportDiff diff(DataImportSnapshot value, List<DataImportRow> rows, Long userId) {
    DataImportSnapshot normalized = withRows(value, rows);
    return diffService.compute(normalized, userId);
  }

  private static DataImportSnapshot withRows(DataImportSnapshot value, List<DataImportRow> rows) {
    return new DataImportSnapshot(
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
        value.dataFile(),
        value.evidenceFile(),
        rows,
        value.normalizedPayloadHash(),
        value.validation(),
        value.diff(),
        value.state(),
        value.reviewedAt(),
        value.reviewedBy(),
        value.reviewNote(),
        value.publishedAt(),
        value.publishedBy(),
        value.publishedReleaseId(),
        value.publishedRevisionId(),
        value.version());
  }

  private void requireMetadata(DataImportCreateReq request, Long userId, CalendarRole managedRole) {
    if (request == null
        || request.targetType() == null
        || request.sourceClaim() == null
        || request.assuranceLevel() == null
        || !StringUtils.hasText(request.importKey())
        || !StringUtils.hasText(request.regionCode())) {
      throw new BizException(ErrorCode.PARAM_INVALID);
    }
    if (request.targetType() == DataImportTarget.SYSTEM_BASELINE) {
      if (request.targetCalendarId() != null
          || calendarContextRepository.findSystemByRegion(request.regionCode().strip()).isEmpty()) {
        throw importScopeInvalid();
      }
      requireSystemSource(request);
      return;
    }
    if (request.targetCalendarId() == null) {
      throw importScopeInvalid();
    }
    CalendarContext calendar =
        calendarAccessService.requireVisible(request.targetCalendarId(), userId);
    if (calendar.kind() != CalendarKind.MANAGED
        || !calendar.regionCode().equals(request.regionCode().strip())) {
      throw importScopeInvalid();
    }
    calendarAccessService.requireRole(request.targetCalendarId(), userId, managedRole);
  }

  private void requireAccess(DataImportSnapshot value, Long userId, CalendarRole managedRole) {
    if (value.target() == DataImportTarget.MANAGED_OVERRIDE) {
      calendarAccessService.requireRole(value.targetCalendarId(), userId, managedRole);
    }
  }

  private static void requireSystemSource(DataImportCreateReq value) {
    if (value.sourceClaim() != ImportSourceClaim.OFFICIAL_NOTICE
        || value.assuranceLevel() == ImportAssuranceLevel.UNVERIFIED
        || !StringUtils.hasText(value.documentNo())
        || !StringUtils.hasText(value.documentTitle())
        || !StringUtils.hasText(value.issuer())
        || value.documentPublishedOn() == null) {
      throw sourceEvidenceRequired();
    }
  }

  private static void requireSystemSource(DataImportSnapshot value) {
    if (value.sourceClaim() != ImportSourceClaim.OFFICIAL_NOTICE
        || value.assuranceLevel() == ImportAssuranceLevel.UNVERIFIED
        || !StringUtils.hasText(value.documentNo())
        || !StringUtils.hasText(value.documentTitle())
        || !StringUtils.hasText(value.issuer())
        || value.documentPublishedOn() == null
        || value.reviewedAt() == null
        || !StringUtils.hasText(value.reviewedBy())) {
      throw sourceEvidenceRequired();
    }
  }

  private static void requireStoredFileHash(DataImportSnapshot value) {
    if (!Objects.equals(
        value.dataFile().sha256(), DataImportFilePolicy.sha256(value.dataFile().bytes()))) {
      throw new BizException(ErrorCode.CONFLICT);
    }
  }

  private DataImportSnapshot require(Long id) {
    return dataImportRepository.findById(id).orElseThrow(DataImportService::notFound);
  }

  private DataImportSnapshot requireLocked(Long id) {
    DataImportSnapshot value = dataImportRepository.findByIdForUpdate(id);
    if (value == null) {
      throw notFound();
    }
    return value;
  }

  private static void requireState(DataImportSnapshot value, DataImportState expected) {
    if (value.state() != expected) {
      throw importStateInvalid();
    }
  }

  private static ImportDownload download(ImportFileEvidence value) {
    return new ImportDownload(value.fileName(), "application/octet-stream", value.bytes());
  }

  private static String normalize(String value) {
    return StringUtils.hasText(value) ? value.strip() : null;
  }

  private static String releaseKey(DataImportSnapshot value) {
    String suffix = Long.toUnsignedString(value.id(), 36).toUpperCase(java.util.Locale.ROOT);
    String key =
        value.regionCode().toUpperCase(java.util.Locale.ROOT)
            + "-"
            + value.dataYear()
            + "-I-"
            + suffix;
    return key.length() <= 64 ? key : key.substring(0, 64);
  }

  private static String sourceReason(DataImportSnapshot value) {
    return (value.documentNo() + " " + value.documentTitle()).strip();
  }

  private static BizException notFound() {
    return new BizException(ErrorCode.NOT_FOUND);
  }

  private static BizException baselineUnavailable() {
    CalendarErrorCode error = CalendarErrorCode.CALENDAR_BASELINE_UNAVAILABLE;
    return new BizException(error.getCode(), error.getMessage());
  }

  private static BizException importStateInvalid() {
    CalendarErrorCode error = CalendarErrorCode.CALENDAR_IMPORT_STATE_INVALID;
    return new BizException(error.getCode(), error.getMessage());
  }

  private static BizException importScopeInvalid() {
    CalendarErrorCode error = CalendarErrorCode.CALENDAR_IMPORT_SCOPE_INVALID;
    return new BizException(error.getCode(), error.getMessage());
  }

  private static BizException sourceEvidenceRequired() {
    CalendarErrorCode error = CalendarErrorCode.CALENDAR_IMPORT_SOURCE_EVIDENCE_REQUIRED;
    return new BizException(error.getCode(), error.getMessage());
  }

  private record PublicationResult(Long releaseId, Long revisionId) {}

  private record OperationKey(LocalDate date, DayField field) {}
}
