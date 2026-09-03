package io.apocalypse.calendar.application;

import io.apocalypse.calendar.api.CalendarErrorCode;
import io.apocalypse.calendar.domain.BaselineReleaseRepository;
import io.apocalypse.calendar.domain.BaselineReleaseSnapshot;
import io.apocalypse.calendar.domain.CalendarContext;
import io.apocalypse.calendar.domain.CalendarRole;
import io.apocalypse.calendar.domain.ConflictResolution;
import io.apocalypse.calendar.domain.ConflictState;
import io.apocalypse.calendar.domain.DayField;
import io.apocalypse.calendar.domain.DayFieldResolver;
import io.apocalypse.calendar.domain.DayOverrideOperation;
import io.apocalypse.calendar.domain.ManagedDraftReplacement;
import io.apocalypse.calendar.domain.OverrideAction;
import io.apocalypse.calendar.domain.OverrideConflictCreate;
import io.apocalypse.calendar.domain.OverrideConflictRecordState;
import io.apocalypse.calendar.domain.OverrideConflictRepository;
import io.apocalypse.calendar.domain.OverrideConflictSnapshot;
import io.apocalypse.calendar.domain.OverrideConflictTrigger;
import io.apocalypse.calendar.domain.OverrideContentHasher;
import io.apocalypse.calendar.domain.OverrideRevisionRepository;
import io.apocalypse.calendar.domain.OverrideRevisionSnapshot;
import io.apocalypse.calendar.domain.OverrideScope;
import io.apocalypse.calendar.domain.PersonalOverrideReplacement;
import io.apocalypse.calendar.domain.ResolvedDayField;
import io.apocalypse.calendar.domain.SourceLayer;
import io.apocalypse.calendar.interfaces.dto.request.ConflictResolutionReq;
import io.apocalypse.calendar.interfaces.dto.request.ConflictResolveReq;
import io.apocalypse.calendar.interfaces.dto.request.OverridePublishReq;
import io.apocalypse.calendar.interfaces.dto.response.OverrideConflictResp;
import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.common.response.PageResult;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class OverrideConflictService {

  private static final String DETECTOR_ACTOR = "conflict-detector";

  private final CalendarCapabilityGuard capabilityGuard;

  private final CalendarAccessService calendarAccessService;

  private final DateQueryService dateQueryService;

  private final BaselineReleaseRepository baselineReleaseRepository;

  private final OverrideRevisionRepository revisionRepository;

  private final OverrideConflictRepository conflictRepository;

  @Transactional
  public PageResult<OverrideConflictResp> pagePersonal(
      Long calendarId, int page, int size, Long userId) {
    capabilityGuard.requireEnabled();
    calendarAccessService.requireVisible(calendarId, userId);
    materialize(calendarId, OverrideScope.PERSONAL, userId, userId);
    return conflictRepository
        .pageCurrent(calendarId, OverrideScope.PERSONAL, userId, page, size)
        .map(OverrideConflictService::toResponse);
  }

  @Transactional
  public OverrideConflictResp resolvePersonal(
      Long calendarId, Long conflictId, ConflictResolveReq request, Long userId, String actor) {
    capabilityGuard.requireEnabled();
    if (request == null || request.resolution() == null) {
      throw new BizException(ErrorCode.PARAM_INVALID);
    }
    CalendarContext calendar = calendarAccessService.requireVisible(calendarId, userId);
    revisionRepository.lockPublishedPersonal(calendarId, userId);
    materialize(calendarId, OverrideScope.PERSONAL, userId, userId);
    OverrideConflictSnapshot conflict =
        conflictRepository
            .findCurrentById(conflictId, calendarId, OverrideScope.PERSONAL, userId)
            .filter(value -> value.state() == OverrideConflictRecordState.OPEN)
            .orElseThrow(OverrideConflictService::revisionStateInvalid);
    OverrideRevisionSnapshot current =
        revisionRepository
            .findPublished(calendarId, OverrideScope.PERSONAL, userId)
            .orElseThrow(OverrideConflictService::revisionStateInvalid);
    if (current.revisionNo() != request.expectedRevisionNo()) {
      throw new BizException(ErrorCode.CONFLICT);
    }
    ResolvedDayField underlay =
        dateQueryService
            .personalUnderlay(calendarId, conflict.date(), userId)
            .get(conflict.field());
    requireCurrentHash(conflict, underlay);

    if (request.resolution() == ConflictResolution.KEEP) {
      conflictRepository.resolve(conflict.id(), OverrideConflictRecordState.KEPT, null, actor);
      return resolvedResponse(
          conflict, OverrideConflictRecordState.KEPT, null, actor, LocalDateTime.now());
    }

    DayOverrideOperation target =
        current.operations().stream()
            .filter(operation -> operation.id().equals(conflict.overrideItemId()))
            .findFirst()
            .orElseThrow(OverrideConflictService::revisionStateInvalid);
    List<DayOverrideOperation> operations = new ArrayList<>();
    for (DayOverrideOperation operation : current.operations()) {
      operations.add(
          operation.id().equals(target.id())
              ? resolvedOperation(operation, request.resolution(), underlay)
              : operation);
    }
    operations.sort(
        Comparator.comparing(DayOverrideOperation::date)
            .thenComparing(operation -> operation.field().name()));
    BaselineReleaseSnapshot release = requireBaseline(calendar.regionCode());
    OverrideRevisionSnapshot published =
        revisionRepository.replacePublishedPersonal(
            new PersonalOverrideReplacement(
                calendarId,
                userId,
                release.id(),
                current.revisionNo(),
                OverrideContentHasher.hash(operations),
                actor,
                operations));
    OverrideConflictRecordState state =
        request.resolution() == ConflictResolution.REBASE
            ? OverrideConflictRecordState.REBASED
            : OverrideConflictRecordState.INHERITED;
    conflictRepository.resolve(conflict.id(), state, published.id(), actor);
    return resolvedResponse(conflict, state, published.id(), actor, LocalDateTime.now());
  }

  @Transactional
  public PageResult<OverrideConflictResp> pageManaged(
      Long calendarId, int page, int size, Long userId) {
    capabilityGuard.requireEnabled();
    calendarAccessService.requireRole(calendarId, userId, CalendarRole.EDITOR);
    materialize(calendarId, OverrideScope.MANAGED, null, userId);
    return conflictRepository
        .pageCurrent(calendarId, OverrideScope.MANAGED, null, page, size)
        .map(OverrideConflictService::toResponse);
  }

  @Transactional
  ManagedConflictPreparation prepareManagedPublish(
      Long calendarId,
      OverridePublishReq request,
      OverrideRevisionSnapshot draft,
      Long userId,
      String actor) {
    materialize(calendarId, OverrideScope.MANAGED, null, userId);
    List<OverrideConflictSnapshot> open =
        conflictRepository.findOpenCurrent(calendarId, OverrideScope.MANAGED, null);
    Map<Long, ConflictResolution> requested = requireResolutions(request.conflictResolutions());
    Set<Long> openIds =
        open.stream()
            .map(OverrideConflictSnapshot::id)
            .collect(HashSet::new, Set::add, Set::addAll);
    if (!requested.keySet().equals(openIds)) {
      throw conflictReviewRequired();
    }
    if (open.isEmpty()) {
      return new ManagedConflictPreparation(draft, List.of());
    }

    Map<OperationKey, DayOverrideOperation> operations = new HashMap<>();
    draft
        .operations()
        .forEach(
            operation ->
                operations.put(new OperationKey(operation.date(), operation.field()), operation));
    List<ManagedConflictPreparation.Resolution> resolutions = new ArrayList<>();
    for (OverrideConflictSnapshot conflict : open) {
      ConflictResolution resolution = requested.get(conflict.id());
      ResolvedDayField underlay =
          dateQueryService
              .managedUnderlay(calendarId, conflict.date(), userId)
              .get(conflict.field());
      requireCurrentHash(conflict, underlay);
      OperationKey key = new OperationKey(conflict.date(), conflict.field());
      DayOverrideOperation operation = operations.get(key);
      if (operation == null) {
        throw conflictReviewRequired();
      }
      // A managed publish creates a new immutable revision. Every resolution, including KEEP,
      // must checkpoint the current underlay on that new revision so the same change is not
      // materialized again immediately after publication.
      operations.put(key, resolvedOperation(operation, resolution, underlay));
      resolutions.add(new ManagedConflictPreparation.Resolution(conflict.id(), resolution));
    }

    List<DayOverrideOperation> items =
        operations.values().stream()
            .sorted(
                Comparator.comparing(DayOverrideOperation::date)
                    .thenComparing(operation -> operation.field().name()))
            .toList();
    CalendarContext calendar = calendarAccessService.requireVisible(calendarId, userId);
    BaselineReleaseSnapshot release = requireBaseline(calendar.regionCode());
    OverrideRevisionSnapshot saved =
        revisionRepository.replaceManagedDraft(
            new ManagedDraftReplacement(
                calendarId,
                release.id(),
                null,
                draft.revisionNo(),
                OverrideContentHasher.hash(items),
                actor,
                items));
    return new ManagedConflictPreparation(saved, List.copyOf(resolutions));
  }

  @Transactional
  void completeManagedPublish(
      ManagedConflictPreparation preparation, Long publishedRevisionId, String actor) {
    for (ManagedConflictPreparation.Resolution resolution : preparation.resolutions()) {
      OverrideConflictRecordState state =
          switch (resolution.resolution()) {
            case KEEP -> OverrideConflictRecordState.KEPT;
            case REBASE -> OverrideConflictRecordState.REBASED;
            case INHERIT -> OverrideConflictRecordState.INHERITED;
          };
      conflictRepository.resolve(
          resolution.conflictId(),
          state,
          resolution.resolution() == ConflictResolution.KEEP ? null : publishedRevisionId,
          actor);
    }
  }

  private void materialize(
      Long calendarId, OverrideScope scope, Long ownerUserId, Long resolvingUserId) {
    OverrideRevisionSnapshot revision =
        revisionRepository.findPublished(calendarId, scope, ownerUserId).orElse(null);
    if (revision == null) {
      return;
    }
    for (DayOverrideOperation operation : revision.operations()) {
      if (operation.action() == OverrideAction.INHERIT) {
        continue;
      }
      Map<DayField, ResolvedDayField> underlay =
          scope == OverrideScope.PERSONAL
              ? dateQueryService.personalUnderlay(calendarId, operation.date(), ownerUserId)
              : dateQueryService.managedUnderlay(calendarId, operation.date(), resolvingUserId);
      ResolvedDayField current = underlay.get(operation.field());
      String currentHash = DayFieldResolver.hash(current.value());
      boolean keptCurrentValue =
          operation.persistedConflictState() == ConflictState.KEPT
              && currentHash.equals(operation.persistedConflictUnderlayHash());
      if (!operation.savedUnderlayHash().equals(currentHash) && !keptCurrentValue) {
        conflictRepository.create(
            new OverrideConflictCreate(
                operation.id(),
                trigger(current.source().layer()),
                triggerKey(current),
                operation.savedUnderlay(),
                current.value(),
                operation.savedUnderlayHash(),
                currentHash,
                DETECTOR_ACTOR));
      }
    }
  }

  private static DayOverrideOperation resolvedOperation(
      DayOverrideOperation operation, ConflictResolution resolution, ResolvedDayField underlay) {
    return new DayOverrideOperation(
        null,
        operation.date(),
        operation.field(),
        resolution == ConflictResolution.INHERIT ? OverrideAction.INHERIT : operation.action(),
        resolution == ConflictResolution.INHERIT ? null : operation.value(),
        underlay.value(),
        DayFieldResolver.hash(underlay.value()),
        underlay.source(),
        ConflictState.NONE,
        null,
        null);
  }

  private static Map<Long, ConflictResolution> requireResolutions(
      List<ConflictResolutionReq> values) {
    if (values == null || values.isEmpty()) {
      return Map.of();
    }
    Map<Long, ConflictResolution> result = new HashMap<>();
    for (ConflictResolutionReq value : values) {
      if (value == null
          || value.conflictId() == null
          || value.resolution() == null
          || result.put(value.conflictId(), value.resolution()) != null) {
        throw new BizException(ErrorCode.PARAM_INVALID);
      }
    }
    return Map.copyOf(result);
  }

  private static OverrideConflictTrigger trigger(SourceLayer layer) {
    return switch (layer) {
      case MANAGED_OVERRIDE -> OverrideConflictTrigger.PARENT_MANAGED_REVISION;
      case PERSONAL_OVERRIDE -> OverrideConflictTrigger.LESS_SPECIFIC_PERSONAL_REVISION;
      case SYSTEM_DATASET, SYSTEM_CORRECTION, NONE -> OverrideConflictTrigger.BASELINE_RELEASE;
    };
  }

  private static String triggerKey(ResolvedDayField current) {
    String version = current.source().sourceVersion();
    return version == null ? "underlay:" + current.underlayHash() : version;
  }

  private static void requireCurrentHash(
      OverrideConflictSnapshot conflict, ResolvedDayField underlay) {
    if (!conflict.currentHash().equals(DayFieldResolver.hash(underlay.value()))) {
      throw new BizException(ErrorCode.CONFLICT);
    }
  }

  private BaselineReleaseSnapshot requireBaseline(String regionCode) {
    return baselineReleaseRepository
        .findPublished(regionCode)
        .orElseThrow(OverrideConflictService::baselineUnavailable);
  }

  private static OverrideConflictResp toResponse(OverrideConflictSnapshot value) {
    return new OverrideConflictResp(
        value.id(),
        value.overrideItemId(),
        value.calendarId(),
        value.scope(),
        value.date(),
        value.field(),
        value.triggerType(),
        value.triggerKey(),
        OverrideResponseMapper.toResponse(value.previousUnderlay()),
        OverrideResponseMapper.toResponse(value.currentUnderlay()),
        value.previousHash(),
        value.currentHash(),
        value.state(),
        value.detectedAt(),
        value.resolvedAt(),
        value.resolvedBy(),
        value.resolutionRevisionId());
  }

  private static OverrideConflictResp resolvedResponse(
      OverrideConflictSnapshot value,
      OverrideConflictRecordState state,
      Long resolutionRevisionId,
      String actor,
      LocalDateTime resolvedAt) {
    return new OverrideConflictResp(
        value.id(),
        value.overrideItemId(),
        value.calendarId(),
        value.scope(),
        value.date(),
        value.field(),
        value.triggerType(),
        value.triggerKey(),
        OverrideResponseMapper.toResponse(value.previousUnderlay()),
        OverrideResponseMapper.toResponse(value.currentUnderlay()),
        value.previousHash(),
        value.currentHash(),
        state,
        value.detectedAt(),
        resolvedAt,
        actor,
        resolutionRevisionId);
  }

  private static BizException conflictReviewRequired() {
    CalendarErrorCode error = CalendarErrorCode.CALENDAR_CONFLICT_REVIEW_REQUIRED;
    return new BizException(error.getCode(), error.getMessage());
  }

  private static BizException revisionStateInvalid() {
    CalendarErrorCode error = CalendarErrorCode.CALENDAR_REVISION_STATE_INVALID;
    return new BizException(error.getCode(), error.getMessage());
  }

  private static BizException baselineUnavailable() {
    CalendarErrorCode error = CalendarErrorCode.CALENDAR_BASELINE_UNAVAILABLE;
    return new BizException(error.getCode(), error.getMessage());
  }

  private record OperationKey(LocalDate date, DayField field) {}
}
