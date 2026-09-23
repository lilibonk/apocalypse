package io.apocalypse.calendar.infrastructure.persistence;

import io.apocalypse.calendar.api.CalendarErrorCode;
import io.apocalypse.calendar.domain.ConflictState;
import io.apocalypse.calendar.domain.DayField;
import io.apocalypse.calendar.domain.DayOverrideOperation;
import io.apocalypse.calendar.domain.ManagedDraftPublish;
import io.apocalypse.calendar.domain.ManagedDraftReplacement;
import io.apocalypse.calendar.domain.OverrideAction;
import io.apocalypse.calendar.domain.OverrideConflictRecordState;
import io.apocalypse.calendar.domain.OverrideConflictRepository;
import io.apocalypse.calendar.domain.OverrideConflictSnapshot;
import io.apocalypse.calendar.domain.OverrideContentHasher;
import io.apocalypse.calendar.domain.OverrideRevisionRepository;
import io.apocalypse.calendar.domain.OverrideRevisionSnapshot;
import io.apocalypse.calendar.domain.OverrideRevisionState;
import io.apocalypse.calendar.domain.OverrideScope;
import io.apocalypse.calendar.domain.PersonalOverrideReplacement;
import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.exception.ConcurrencyGuard;
import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.common.response.PageResult;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import com.baomidou.mybatisplus.core.toolkit.IdWorker;

import lombok.RequiredArgsConstructor;

@Repository
@RequiredArgsConstructor
public class MybatisOverrideRevisionRepository implements OverrideRevisionRepository {

  private final OverrideRevisionMapper revisionMapper;

  private final DayOverrideMapper dayOverrideMapper;

  private final DayFieldValueJsonCodec valueJsonCodec;

  private final OverrideConflictRepository conflictRepository;

  private final OverrideConflictMapper conflictMapper;

  @Override
  public void lockManagedScope(Long calendarId) {
    revisionMapper.lockManagedScope(calendarId);
  }

  @Override
  public void lockPublishedPersonal(Long calendarId, Long ownerUserId) {
    // An absent first revision cannot be protected by FOR UPDATE alone.
    revisionMapper.lockPersonalScope(calendarId, ownerUserId);
    revisionMapper.selectPublishedPersonalForUpdate(calendarId, ownerUserId);
  }

  @Override
  public Optional<OverrideRevisionSnapshot> findPublished(
      Long calendarId, OverrideScope scope, Long ownerUserId) {
    return Optional.ofNullable(revisionMapper.selectPublished(calendarId, scope, ownerUserId))
        .map(this::toSnapshot);
  }

  @Override
  public Optional<OverrideRevisionSnapshot> findPublishedForRange(
      Long calendarId, OverrideScope scope, Long ownerUserId, LocalDate from, LocalDate to) {
    return Optional.ofNullable(revisionMapper.selectPublished(calendarId, scope, ownerUserId))
        .map(value -> toSnapshot(value, from, to));
  }

  @Override
  public Optional<OverrideRevisionSnapshot> findDraftManaged(Long calendarId) {
    return Optional.ofNullable(revisionMapper.selectDraftManaged(calendarId)).map(this::toSnapshot);
  }

  @Override
  public PageResult<OverrideRevisionSnapshot> pageManaged(Long calendarId, int page, int size) {
    return revisionMapper.selectManagedPage(calendarId, page, size).map(this::toSnapshot);
  }

  @Override
  @Transactional
  public OverrideRevisionSnapshot replacePublishedPersonal(
      PersonalOverrideReplacement replacement) {
    revisionMapper.lockPersonalScope(replacement.calendarId(), replacement.ownerUserId());
    OverrideRevisionDo current =
        revisionMapper.selectPublishedPersonalForUpdate(
            replacement.calendarId(), replacement.ownerUserId());
    int currentRevisionNo = current == null ? 0 : current.getRevisionNo();
    if (currentRevisionNo != replacement.expectedRevisionNo()) {
      throw new BizException(ErrorCode.CONFLICT);
    }
    if (current != null) {
      ConcurrencyGuard.requireSingleRow(
          revisionMapper.supersedePublished(current.getId(), replacement.actor()));
    }

    OverrideRevisionDo created = new OverrideRevisionDo();
    created.setCalendarId(replacement.calendarId());
    created.setScopeType(OverrideScope.PERSONAL.name());
    created.setOwnerUserId(replacement.ownerUserId());
    created.setRevisionNo(currentRevisionNo + 1);
    created.setState(OverrideRevisionState.PUBLISHED.name());
    created.setBaselineReleaseId(replacement.baselineReleaseId());
    created.setContentHash(replacement.contentHash());
    created.setPublishedAt(LocalDateTime.now());
    created.setPublishedBy(replacement.actor());
    revisionMapper.insert(created);

    Map<Long, OverrideConflictSnapshot> currentConflicts =
        conflictRepository.findLatestForItems(
            replacement.operations().stream()
                .map(DayOverrideOperation::id)
                .filter(Objects::nonNull)
                .toList());
    replacement
        .operations()
        .forEach(
            operation -> {
              Long itemId = insertOperation(created.getId(), operation, replacement.actor());
              OverrideConflictSnapshot conflict =
                  operation.id() == null ? null : currentConflicts.get(operation.id());
              if (conflict != null && conflict.state() == OverrideConflictRecordState.KEPT) {
                conflictMapper.copyLatestKept(
                    IdWorker.getId(), operation.id(), itemId, replacement.actor());
              }
            });
    return findPublished(
            replacement.calendarId(), OverrideScope.PERSONAL, replacement.ownerUserId())
        .orElseThrow(() -> new IllegalStateException("个人覆盖发布后无法回读"));
  }

  @Override
  @Transactional
  public OverrideRevisionSnapshot replaceManagedDraft(ManagedDraftReplacement replacement) {
    revisionMapper.lockManagedScope(replacement.calendarId());
    OverrideRevisionDo draft = revisionMapper.selectDraftManagedForUpdate(replacement.calendarId());
    OverrideRevisionDo published =
        revisionMapper.selectPublishedManagedForUpdate(replacement.calendarId());
    int publishedRevisionNo = published == null ? 0 : published.getRevisionNo();
    if (draft == null) {
      if (replacement.expectedRevisionNo() != publishedRevisionNo) {
        throw new BizException(ErrorCode.CONFLICT);
      }
      // Withdrawal/discard removes the current head, not its place in immutable history.
      draft =
          newManagedDraft(
              replacement, revisionMapper.selectMaxManagedRevisionNo(replacement.calendarId()) + 1);
      // The scope lock serializes this generation with every draft mutation and publication.
      draft.setVersion(
          Math.incrementExact(revisionMapper.selectMaxManagedVersion(replacement.calendarId())));
      revisionMapper.insert(draft);
    } else {
      if (replacement.expectedRevisionNo() != draft.getRevisionNo()) {
        throw new BizException(ErrorCode.CONFLICT);
      }
      ConcurrencyGuard.requireSingleRow(
          revisionMapper.updateManagedDraft(
              draft.getId(),
              replacement.baselineReleaseId(),
              replacement.sourceImportId(),
              replacement.contentHash(),
              replacement.actor(),
              draft.getVersion()));
      dayOverrideMapper.deleteByRevisionId(draft.getId(), replacement.actor());
    }
    Long draftId = draft.getId();
    replacement
        .operations()
        .forEach(operation -> insertOperation(draftId, operation, replacement.actor()));
    return findDraftManaged(replacement.calendarId())
        .orElseThrow(() -> new IllegalStateException("托管覆盖草稿保存后无法回读"));
  }

  @Override
  @Transactional
  public void discardManagedDraft(Long calendarId, String actor) {
    revisionMapper.lockManagedScope(calendarId);
    OverrideRevisionDo draft = revisionMapper.selectDraftManagedForUpdate(calendarId);
    if (draft == null) {
      throw revisionStateInvalid();
    }
    dayOverrideMapper.deleteByRevisionId(draft.getId(), actor);
    ConcurrencyGuard.requireSingleRow(revisionMapper.deleteManagedDraft(draft.getId(), actor));
  }

  @Override
  @Transactional
  public OverrideRevisionSnapshot publishManagedDraft(ManagedDraftPublish publish) {
    revisionMapper.lockManagedScope(publish.calendarId());
    OverrideRevisionDo draft = revisionMapper.selectDraftManagedForUpdate(publish.calendarId());
    if (draft == null) {
      throw revisionStateInvalid();
    }
    if (draft.getVersion() != publish.expectedDraftVersion()
        || !Objects.equals(draft.getContentHash(), publish.expectedContentHash())) {
      throw new BizException(ErrorCode.CONFLICT);
    }
    if (!OverrideContentHasher.hash(toSnapshot(draft).operations())
        .equals(draft.getContentHash())) {
      throw new BizException(ErrorCode.CONFLICT.getCode(), "草稿使用旧版内容校验，请重新保存并复核后发布");
    }
    OverrideRevisionDo current =
        revisionMapper.selectPublishedManagedForUpdate(publish.calendarId());
    if (current != null) {
      ConcurrencyGuard.requireSingleRow(
          revisionMapper.supersedePublished(current.getId(), publish.actor()));
    }
    ConcurrencyGuard.requireSingleRow(
        revisionMapper.publishManagedDraft(
            draft.getId(), publish.expectedDraftVersion(), publish.actor()));
    return findPublished(publish.calendarId(), OverrideScope.MANAGED, null)
        .orElseThrow(() -> new IllegalStateException("托管覆盖发布后无法回读"));
  }

  @Override
  @Transactional
  public void withdrawPublishedManaged(Long calendarId, Long revisionId, String actor) {
    revisionMapper.lockManagedScope(calendarId);
    OverrideRevisionDo published = revisionMapper.selectPublishedManagedForUpdate(calendarId);
    if (published == null || !published.getId().equals(revisionId)) {
      throw revisionStateInvalid();
    }
    ConcurrencyGuard.requireSingleRow(
        revisionMapper.withdrawPublishedManaged(published.getId(), actor));
  }

  private static OverrideRevisionDo newManagedDraft(
      ManagedDraftReplacement replacement, int revisionNo) {
    OverrideRevisionDo value = new OverrideRevisionDo();
    value.setCalendarId(replacement.calendarId());
    value.setScopeType(OverrideScope.MANAGED.name());
    value.setRevisionNo(revisionNo);
    value.setState(OverrideRevisionState.DRAFT.name());
    value.setBaselineReleaseId(replacement.baselineReleaseId());
    value.setSourceImportId(replacement.sourceImportId());
    value.setContentHash(replacement.contentHash());
    return value;
  }

  private Long insertOperation(Long revisionId, DayOverrideOperation operation, String actor) {
    DayOverrideDo value = new DayOverrideDo();
    value.setId(IdWorker.getId());
    value.setRevisionId(revisionId);
    value.setLocalDate(operation.date());
    value.setFieldKey(operation.field().name());
    value.setAction(operation.action().name());
    value.setValueJson(valueJsonCodec.write(operation.value()));
    value.setUnderlayValueJson(valueJsonCodec.write(operation.savedUnderlay()));
    value.setUnderlayValueHash(operation.savedUnderlayHash());
    value.setUnderlaySourceType(operation.savedUnderlaySource().layer().name());
    value.setUnderlaySourceKey(sourceKey(operation));
    value.setUnderlaySourceVersion(operation.savedUnderlaySource().sourceVersion());
    ConcurrencyGuard.requireSingleRow(dayOverrideMapper.insertJson(value, actor));
    return value.getId();
  }

  private static String sourceKey(DayOverrideOperation operation) {
    var source = operation.savedUnderlaySource();
    return source.layer() == io.apocalypse.calendar.domain.SourceLayer.SYSTEM_DATASET
        ? source.sourceVersion()
        : source.sourceCalendarKey();
  }

  private OverrideRevisionSnapshot toSnapshot(OverrideRevisionDo value) {
    return toSnapshot(value, dayOverrideMapper.selectByRevisionId(value.getId()));
  }

  private OverrideRevisionSnapshot toSnapshot(
      OverrideRevisionDo value, LocalDate from, LocalDate to) {
    return toSnapshot(
        value, dayOverrideMapper.selectByRevisionIdAndDateRange(value.getId(), from, to));
  }

  private OverrideRevisionSnapshot toSnapshot(
      OverrideRevisionDo value, List<DayOverrideDo> operationValues) {
    Map<Long, OverrideConflictSnapshot> conflicts =
        conflictRepository.findLatestForItems(
            operationValues.stream().map(DayOverrideDo::getId).toList());
    List<DayOverrideOperation> operations =
        operationValues.stream()
            .map(operation -> toOperation(operation, conflicts.get(operation.getId())))
            .toList();
    return new OverrideRevisionSnapshot(
        value.getId(),
        value.getCalendarId(),
        OverrideScope.valueOf(value.getScopeType()),
        value.getOwnerUserId(),
        value.getRevisionNo(),
        OverrideRevisionState.valueOf(value.getState()),
        value.getBaselineReleaseId(),
        value.getContentHash(),
        value.getVersion(),
        operations);
  }

  private DayOverrideOperation toOperation(DayOverrideDo value, OverrideConflictSnapshot conflict) {
    ConflictState conflictState =
        conflict == null
            ? ConflictState.NONE
            : conflict.state() == OverrideConflictRecordState.KEPT
                ? ConflictState.KEPT
                : ConflictState.NEEDS_REVIEW;
    return new DayOverrideOperation(
        value.getId(),
        value.getLocalDate(),
        DayField.valueOf(value.getFieldKey()),
        OverrideAction.valueOf(value.getAction()),
        valueJsonCodec.read(value.getValueJson()),
        valueJsonCodec.read(value.getUnderlayValueJson()),
        value.getUnderlayValueHash(),
        new io.apocalypse.calendar.domain.DayFieldSource(
            io.apocalypse.calendar.domain.SourceLayer.valueOf(value.getUnderlaySourceType()),
            null,
            value.getUnderlaySourceKey(),
            value.getUnderlaySourceVersion(),
            OverrideAction.BASE),
        conflictState,
        conflict == null ? null : conflict.currentHash(),
        conflict == null ? null : conflict.id());
  }

  private static BizException revisionStateInvalid() {
    CalendarErrorCode error = CalendarErrorCode.CALENDAR_REVISION_STATE_INVALID;
    return new BizException(error.getCode(), error.getMessage());
  }
}
