package io.apocalypse.calendar.infrastructure.persistence;

import io.apocalypse.calendar.api.CalendarErrorCode;
import io.apocalypse.calendar.api.CancelProjectedEventCommand;
import io.apocalypse.calendar.api.ProjectionItemResult;
import io.apocalypse.calendar.api.ProjectionResultStatus;
import io.apocalypse.calendar.domain.EventContent;
import io.apocalypse.calendar.domain.EventKind;
import io.apocalypse.calendar.domain.EventRevisionState;
import io.apocalypse.calendar.domain.EventSourceKind;
import io.apocalypse.calendar.domain.EventState;
import io.apocalypse.calendar.domain.PreparedProjectionEvent;
import io.apocalypse.calendar.domain.ProjectionEventRepository;
import io.apocalypse.calendar.domain.ProjectionPublishMode;
import io.apocalypse.calendar.domain.ProjectionSourceIdentity;
import io.apocalypse.calendar.domain.ProjectionSourceSnapshot;
import io.apocalypse.calendar.domain.ProjectionSourceState;
import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.exception.ConcurrencyGuard;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

@Repository
@RequiredArgsConstructor
public class MybatisProjectionEventRepository implements ProjectionEventRepository {

  private final ProjectionSourceMapper sourceMapper;

  private final CalendarEventMapper eventMapper;

  private final EventRevisionMapper revisionMapper;

  @Override
  public void lockSources(String sourceSystem, List<ProjectionSourceIdentity> identities) {
    sourceMapper.lockSources(sourceSystem, identities);
  }

  @Override
  public Optional<ProjectionSourceSnapshot> find(
      String sourceSystem, String sourceType, String sourceKey) {
    return Optional.ofNullable(sourceMapper.selectBySource(sourceSystem, sourceType, sourceKey))
        .map(MybatisProjectionEventRepository::toSnapshot);
  }

  @Override
  @Transactional
  public ProjectionItemResult upsert(
      Long calendarId,
      String sourceSystem,
      ProjectionPublishMode publishMode,
      PreparedProjectionEvent event,
      String actor) {
    sourceMapper.lockSource(sourceSystem, event.sourceType(), event.sourceKey());
    ProjectionSourceDo source =
        sourceMapper.selectForUpdate(sourceSystem, event.sourceType(), event.sourceKey());
    if (source == null) {
      return create(calendarId, sourceSystem, publishMode, event, actor);
    }
    requireSameCalendar(source, calendarId);
    if (ProjectionSourceState.CANCELLED.name().equals(source.getState())) {
      throw revisionStateInvalid();
    }
    ProjectionItemResult idempotent = idempotentResult(source, event);
    if (idempotent != null) {
      return idempotent;
    }

    CalendarEventDo eventHead = eventMapper.selectForUpdate(source.getEventId());
    if (eventHead == null || EventState.CANCELLED.name().equals(eventHead.getState())) {
      throw revisionStateInvalid();
    }
    saveProjectedRevision(eventHead, publishMode, event, actor);
    ConcurrencyGuard.requireSingleRow(
        sourceMapper.updateActive(
            source.getId(),
            event.sourceVersion(),
            event.payloadHash(),
            source.getVersion(),
            actor));
    return result(source, event.sourceVersion(), ProjectionResultStatus.UPDATED);
  }

  @Override
  @Transactional
  public ProjectionItemResult cancel(
      Long calendarId, String sourceSystem, CancelProjectedEventCommand event, String actor) {
    sourceMapper.lockSource(sourceSystem, event.sourceType(), event.sourceKey());
    ProjectionSourceDo source =
        sourceMapper.selectForUpdate(sourceSystem, event.sourceType(), event.sourceKey());
    if (source == null) {
      throw revisionStateInvalid();
    }
    requireSameCalendar(source, calendarId);
    if (event.sourceVersion() < source.getSourceVersion()) {
      return result(source, source.getSourceVersion(), ProjectionResultStatus.STALE);
    }
    if (event.sourceVersion() == source.getSourceVersion()) {
      if (ProjectionSourceState.CANCELLED.name().equals(source.getState())) {
        return result(source, source.getSourceVersion(), ProjectionResultStatus.UNCHANGED);
      }
      throw versionConflict();
    }
    if (ProjectionSourceState.CANCELLED.name().equals(source.getState())) {
      return result(source, source.getSourceVersion(), ProjectionResultStatus.UNCHANGED);
    }

    CalendarEventDo eventHead = eventMapper.selectForUpdate(source.getEventId());
    if (eventHead == null) {
      throw revisionStateInvalid();
    }
    EventRevisionDo draft = revisionMapper.selectDraftForUpdate(eventHead.getId());
    EventRevisionDo published = revisionMapper.selectPublishedForUpdate(eventHead.getId());
    if (draft != null) {
      ConcurrencyGuard.requireSingleRow(revisionMapper.cancelRevision(draft.getId(), actor));
    }
    if (published != null) {
      ConcurrencyGuard.requireSingleRow(revisionMapper.cancelRevision(published.getId(), actor));
    }
    if (draft == null && published == null) {
      EventRevisionDo latest = revisionMapper.selectLatest(eventHead.getId());
      if (latest == null) {
        throw revisionStateInvalid();
      }
      EventRevisionDo cancelled =
          newRevision(
              eventHead.getId(),
              revisionMapper.selectMaxRevisionNo(eventHead.getId()) + 1,
              EventRevisionState.CANCELLED,
              toContent(latest),
              latest.getContentHash(),
              actor);
      cancelled.setClosedAt(LocalDateTime.now());
      cancelled.setClosedBy(actor);
      revisionMapper.insert(cancelled);
    }
    ConcurrencyGuard.requireSingleRow(
        eventMapper.updateManagedState(
            eventHead.getId(), calendarId, EventState.CANCELLED.name(), actor));
    ConcurrencyGuard.requireSingleRow(
        sourceMapper.cancel(source.getId(), event.sourceVersion(), source.getVersion(), actor));
    return result(source, event.sourceVersion(), ProjectionResultStatus.CANCELLED);
  }

  private ProjectionItemResult create(
      Long calendarId,
      String sourceSystem,
      ProjectionPublishMode publishMode,
      PreparedProjectionEvent event,
      String actor) {
    CalendarEventDo eventHead = new CalendarEventDo();
    eventHead.setCalendarId(calendarId);
    eventHead.setEventKind(EventKind.MANAGED.name());
    eventHead.setSourceKind(EventSourceKind.PROJECTION.name());
    eventHead.setState(EventState.ACTIVE.name());
    eventMapper.insert(eventHead);
    EventRevisionState revisionState =
        publishMode == ProjectionPublishMode.DIRECT_PUBLISH
            ? EventRevisionState.PUBLISHED
            : EventRevisionState.DRAFT;
    revisionMapper.insert(
        newRevision(
            eventHead.getId(), 1, revisionState, event.content(), event.payloadHash(), actor));

    ProjectionSourceDo source = new ProjectionSourceDo();
    source.setCalendarId(calendarId);
    source.setEventId(eventHead.getId());
    source.setSourceSystem(sourceSystem);
    source.setSourceType(event.sourceType());
    source.setSourceKey(event.sourceKey());
    source.setSourceVersion(event.sourceVersion());
    source.setPayloadHash(event.payloadHash());
    source.setState(ProjectionSourceState.ACTIVE.name());
    source.setCreateTime(LocalDateTime.now());
    source.setUpdateTime(LocalDateTime.now());
    source.setCreateBy(actor);
    source.setUpdateBy(actor);
    source.setVersion(0);
    sourceMapper.insert(source);
    return result(source, event.sourceVersion(), ProjectionResultStatus.CREATED);
  }

  private void saveProjectedRevision(
      CalendarEventDo eventHead,
      ProjectionPublishMode publishMode,
      PreparedProjectionEvent event,
      String actor) {
    EventRevisionDo draft = revisionMapper.selectDraftForUpdate(eventHead.getId());
    int draftVersion;
    if (draft == null) {
      draft =
          newRevision(
              eventHead.getId(),
              revisionMapper.selectMaxRevisionNo(eventHead.getId()) + 1,
              EventRevisionState.DRAFT,
              event.content(),
              event.payloadHash(),
              actor);
      revisionMapper.insert(draft);
      draftVersion = draft.getVersion();
    } else {
      int previousVersion = draft.getVersion();
      copyContent(draft, event.content());
      draft.setContentHash(event.payloadHash());
      ConcurrencyGuard.requireSingleRow(revisionMapper.updateDraft(draft, previousVersion, actor));
      draftVersion = previousVersion + 1;
    }
    if (publishMode == ProjectionPublishMode.DIRECT_PUBLISH) {
      EventRevisionDo published = revisionMapper.selectPublishedForUpdate(eventHead.getId());
      if (published != null) {
        ConcurrencyGuard.requireSingleRow(
            revisionMapper.supersedePublished(published.getId(), actor));
      }
      ConcurrencyGuard.requireSingleRow(
          revisionMapper.publishDraft(draft.getId(), draftVersion, actor));
      ConcurrencyGuard.requireSingleRow(
          eventMapper.updateManagedState(
              eventHead.getId(), eventHead.getCalendarId(), EventState.ACTIVE.name(), actor));
    }
  }

  private static ProjectionItemResult idempotentResult(
      ProjectionSourceDo source, PreparedProjectionEvent event) {
    if (event.sourceVersion() < source.getSourceVersion()) {
      return result(source, source.getSourceVersion(), ProjectionResultStatus.STALE);
    }
    if (event.sourceVersion() == source.getSourceVersion()) {
      if (event.payloadHash().equals(source.getPayloadHash())) {
        return result(source, source.getSourceVersion(), ProjectionResultStatus.UNCHANGED);
      }
      throw versionConflict();
    }
    return null;
  }

  private static void requireSameCalendar(ProjectionSourceDo source, Long calendarId) {
    if (!source.getCalendarId().equals(calendarId)) {
      throw versionConflict();
    }
  }

  private static ProjectionItemResult result(
      ProjectionSourceDo source, long acceptedVersion, ProjectionResultStatus status) {
    return new ProjectionItemResult(
        source.getSourceType(),
        source.getSourceKey(),
        acceptedVersion,
        source.getEventId(),
        status);
  }

  private static ProjectionSourceSnapshot toSnapshot(ProjectionSourceDo value) {
    return new ProjectionSourceSnapshot(
        value.getId(),
        value.getCalendarId(),
        value.getEventId(),
        value.getSourceSystem(),
        value.getSourceType(),
        value.getSourceKey(),
        value.getSourceVersion(),
        value.getPayloadHash(),
        ProjectionSourceState.valueOf(value.getState()),
        value.getVersion());
  }

  private static EventRevisionDo newRevision(
      Long eventId,
      int revisionNo,
      EventRevisionState state,
      EventContent content,
      String contentHash,
      String actor) {
    EventRevisionDo value = new EventRevisionDo();
    value.setEventId(eventId);
    value.setRevisionNo(revisionNo);
    value.setState(state.name());
    copyContent(value, content);
    value.setContentHash(contentHash);
    if (state == EventRevisionState.PUBLISHED) {
      value.setPublishedAt(LocalDateTime.now());
      value.setPublishedBy(actor);
    }
    return value;
  }

  private static void copyContent(EventRevisionDo target, EventContent content) {
    target.setTitle(content.title());
    target.setDescription(content.description());
    target.setLocation(content.location());
    target.setTimeKind(content.timeKind().name());
    target.setStartDate(content.startDate());
    target.setEndDateExclusive(content.endDateExclusive());
    target.setStartAtUtc(content.startAtUtc());
    target.setEndAtUtc(content.endAtUtc());
    target.setZoneId(content.zoneId());
  }

  private static EventContent toContent(EventRevisionDo value) {
    return new EventContent(
        value.getTitle(),
        value.getDescription(),
        value.getLocation(),
        io.apocalypse.calendar.domain.EventTimeKind.valueOf(value.getTimeKind()),
        value.getStartDate(),
        value.getEndDateExclusive(),
        value.getStartAtUtc(),
        value.getEndAtUtc(),
        value.getZoneId());
  }

  private static BizException versionConflict() {
    CalendarErrorCode error = CalendarErrorCode.CALENDAR_PROJECTION_VERSION_CONFLICT;
    return new BizException(error.getCode(), error.getMessage());
  }

  private static BizException revisionStateInvalid() {
    CalendarErrorCode error = CalendarErrorCode.CALENDAR_REVISION_STATE_INVALID;
    return new BizException(error.getCode(), error.getMessage());
  }
}
