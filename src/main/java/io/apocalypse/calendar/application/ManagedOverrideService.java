package io.apocalypse.calendar.application;

import io.apocalypse.calendar.api.CalendarErrorCode;
import io.apocalypse.calendar.domain.BaselineReleaseRepository;
import io.apocalypse.calendar.domain.BaselineReleaseSnapshot;
import io.apocalypse.calendar.domain.CalendarContext;
import io.apocalypse.calendar.domain.CalendarRole;
import io.apocalypse.calendar.domain.DayField;
import io.apocalypse.calendar.domain.DayOverrideOperation;
import io.apocalypse.calendar.domain.ManagedDraftPublish;
import io.apocalypse.calendar.domain.ManagedDraftReplacement;
import io.apocalypse.calendar.domain.OverrideContentHasher;
import io.apocalypse.calendar.domain.OverrideRevisionRepository;
import io.apocalypse.calendar.domain.OverrideRevisionSnapshot;
import io.apocalypse.calendar.domain.OverrideScope;
import io.apocalypse.calendar.domain.ResolvedDayField;
import io.apocalypse.calendar.interfaces.dto.request.DayFieldOperationReq;
import io.apocalypse.calendar.interfaces.dto.request.DayOverrideSaveReq;
import io.apocalypse.calendar.interfaces.dto.request.OverridePublishReq;
import io.apocalypse.calendar.interfaces.dto.response.OverrideRevisionResp;
import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.common.response.PageResult;

import java.time.LocalDate;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class ManagedOverrideService {

  private final CalendarCapabilityGuard capabilityGuard;

  private final CalendarAccessService calendarAccessService;

  private final DateQueryService dateQueryService;

  private final BaselineReleaseRepository baselineReleaseRepository;

  private final OverrideRevisionRepository overrideRevisionRepository;

  private final OverrideConflictService overrideConflictService;

  @Transactional(readOnly = true)
  public PageResult<OverrideRevisionResp> revisions(
      Long calendarId, int page, int size, Long userId) {
    capabilityGuard.requireEnabled();
    calendarAccessService.requireRole(calendarId, userId, CalendarRole.EDITOR);
    return overrideRevisionRepository
        .pageManaged(calendarId, page, size)
        .map(OverrideResponseMapper::toResponse);
  }

  @Transactional(readOnly = true)
  public OverrideRevisionResp draft(Long calendarId, Long userId) {
    capabilityGuard.requireEnabled();
    calendarAccessService.requireRole(calendarId, userId, CalendarRole.EDITOR);
    return overrideRevisionRepository
        .findDraftManaged(calendarId)
        .map(OverrideResponseMapper::toResponse)
        .orElse(null);
  }

  @Transactional
  public OverrideRevisionResp saveDraft(
      Long calendarId, LocalDate date, DayOverrideSaveReq request, Long userId, String actor) {
    capabilityGuard.requireEnabled();
    if (date == null || request == null || userId == null) {
      throw new BizException(ErrorCode.PARAM_INVALID);
    }
    calendarAccessService.requireRole(calendarId, userId, CalendarRole.EDITOR);
    CalendarContext calendar = calendarAccessService.requireVisible(calendarId, userId);
    // Serialize the read/merge/write, not only the final repository replacement.
    overrideRevisionRepository.lockManagedScope(calendarId);
    BaselineReleaseSnapshot release =
        baselineReleaseRepository
            .findPublished(calendar.regionCode())
            .orElseThrow(this::baselineUnavailable);
    OverrideRevisionSnapshot draft =
        overrideRevisionRepository.findDraftManaged(calendarId).orElse(null);
    OverrideRevisionSnapshot published =
        overrideRevisionRepository
            .findPublished(calendarId, OverrideScope.MANAGED, null)
            .orElse(null);
    int actualRevisionNo =
        draft == null ? (published == null ? 0 : published.revisionNo()) : draft.revisionNo();
    if (request.expectedRevisionNo() != actualRevisionNo) {
      throw new BizException(ErrorCode.CONFLICT);
    }

    List<DayFieldOperationReq> requested =
        DayOverrideCommandFactory.requireOperations(request.operations());
    Map<DayField, ResolvedDayField> underlay =
        dateQueryService.managedUnderlay(calendarId, date, userId);
    Map<OperationKey, DayOverrideOperation> snapshot = new HashMap<>();
    OverrideRevisionSnapshot source = draft == null ? published : draft;
    if (source != null) {
      source
          .operations()
          .forEach(
              operation ->
                  snapshot.put(new OperationKey(operation.date(), operation.field()), operation));
    }
    for (DayFieldOperationReq operation : requested) {
      snapshot.put(
          new OperationKey(date, operation.field()),
          DayOverrideCommandFactory.create(date, operation, underlay.get(operation.field())));
    }
    DayOverrideCommandFactory.requireSnapshotSize(snapshot.size());
    List<DayOverrideOperation> operations =
        snapshot.values().stream()
            .sorted(
                Comparator.comparing(DayOverrideOperation::date)
                    .thenComparing(operation -> operation.field().name()))
            .toList();
    OverrideRevisionSnapshot saved =
        overrideRevisionRepository.replaceManagedDraft(
            new ManagedDraftReplacement(
                calendarId,
                release.id(),
                null,
                actualRevisionNo,
                OverrideContentHasher.hash(operations),
                actor,
                operations));
    return OverrideResponseMapper.toResponse(saved);
  }

  @Transactional
  public void discardDraft(Long calendarId, Long userId, String actor) {
    capabilityGuard.requireEnabled();
    calendarAccessService.requireRole(calendarId, userId, CalendarRole.EDITOR);
    overrideRevisionRepository.discardManagedDraft(calendarId, actor);
  }

  @Transactional
  public OverrideRevisionResp publish(
      Long calendarId, OverridePublishReq request, Long userId, String actor) {
    capabilityGuard.requireEnabled();
    if (request == null || request.expectedContentHash() == null) {
      throw new BizException(ErrorCode.PARAM_INVALID);
    }
    calendarAccessService.requireRole(calendarId, userId, CalendarRole.PUBLISHER);
    overrideRevisionRepository.lockManagedScope(calendarId);
    OverrideRevisionSnapshot draft =
        overrideRevisionRepository
            .findDraftManaged(calendarId)
            .orElseThrow(ManagedOverrideService::revisionStateInvalid);
    if (draft.version() != request.expectedDraftVersion()
        || !Objects.equals(draft.contentHash(), request.expectedContentHash())) {
      throw new BizException(ErrorCode.CONFLICT);
    }
    if (!OverrideContentHasher.hash(draft.operations()).equals(draft.contentHash())) {
      throw new BizException(ErrorCode.CONFLICT.getCode(), "草稿使用旧版内容校验，请重新保存并复核后发布");
    }
    ManagedConflictPreparation preparation =
        overrideConflictService.prepareManagedPublish(calendarId, request, draft, userId, actor);
    OverrideRevisionSnapshot published =
        overrideRevisionRepository.publishManagedDraft(
            new ManagedDraftPublish(
                calendarId,
                preparation.draft().version(),
                preparation.draft().contentHash(),
                actor));
    overrideConflictService.completeManagedPublish(preparation, published.id(), actor);
    return OverrideResponseMapper.toResponse(published);
  }

  @Transactional
  public void withdraw(Long calendarId, Long revisionId, Long userId, String actor) {
    capabilityGuard.requireEnabled();
    calendarAccessService.requireRole(calendarId, userId, CalendarRole.PUBLISHER);
    overrideRevisionRepository.withdrawPublishedManaged(calendarId, revisionId, actor);
  }

  private BizException baselineUnavailable() {
    CalendarErrorCode error = CalendarErrorCode.CALENDAR_BASELINE_UNAVAILABLE;
    return new BizException(error.getCode(), error.getMessage());
  }

  private static BizException revisionStateInvalid() {
    CalendarErrorCode error = CalendarErrorCode.CALENDAR_REVISION_STATE_INVALID;
    return new BizException(error.getCode(), error.getMessage());
  }

  private record OperationKey(LocalDate date, DayField field) {}
}
