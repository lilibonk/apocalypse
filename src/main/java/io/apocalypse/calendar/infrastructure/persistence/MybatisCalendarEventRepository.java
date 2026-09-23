package io.apocalypse.calendar.infrastructure.persistence;

import io.apocalypse.calendar.api.CalendarErrorCode;
import io.apocalypse.calendar.domain.CalendarEventRepository;
import io.apocalypse.calendar.domain.CalendarEventSnapshot;
import io.apocalypse.calendar.domain.EventContent;
import io.apocalypse.calendar.domain.EventContentHasher;
import io.apocalypse.calendar.domain.EventKind;
import io.apocalypse.calendar.domain.EventRevisionSnapshot;
import io.apocalypse.calendar.domain.EventRevisionState;
import io.apocalypse.calendar.domain.EventSourceKind;
import io.apocalypse.calendar.domain.EventState;
import io.apocalypse.calendar.domain.EventTimeKind;
import io.apocalypse.calendar.domain.ManagedEventDraftCreate;
import io.apocalypse.calendar.domain.ManagedEventDraftSave;
import io.apocalypse.calendar.domain.ManagedEventPublish;
import io.apocalypse.calendar.domain.PrivateEventCreate;
import io.apocalypse.calendar.domain.PrivateEventUpdate;
import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.exception.ConcurrencyGuard;
import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.common.response.PageResult;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

@Repository
@RequiredArgsConstructor
public class MybatisCalendarEventRepository implements CalendarEventRepository {

  private final CalendarEventMapper eventMapper;

  private final EventRevisionMapper revisionMapper;

  @Override
  public PageResult<CalendarEventSnapshot> pageVisible(
      Long calendarId,
      List<Long> managedCalendarIds,
      Long ownerUserId,
      LocalDate from,
      LocalDate toExclusive,
      LocalDateTime fromUtc,
      LocalDateTime toUtc,
      int page,
      int size) {
    List<Long> scopes = managedCalendarIds.isEmpty() ? List.of(-1L) : managedCalendarIds;
    long total =
        eventMapper.countVisible(
            calendarId, scopes, ownerUserId, from, toExclusive, fromUtc, toUtc);
    List<CalendarEventSnapshot> events =
        findCurrentBatch(
            eventMapper.selectVisibleIds(
                calendarId,
                scopes,
                ownerUserId,
                from,
                toExclusive,
                fromUtc,
                toUtc,
                size,
                (long) (page - 1) * size));
    return new PageResult<>(events, total, page, size);
  }

  @Override
  public Optional<CalendarEventSnapshot> findCurrent(Long eventId) {
    CalendarEventDo event = eventMapper.selectById(eventId);
    if (event == null) {
      return Optional.empty();
    }
    EventRevisionDo revision = revisionMapper.selectPublished(eventId);
    return revision == null ? Optional.empty() : Optional.of(toSnapshot(event, revision));
  }

  private List<CalendarEventSnapshot> findCurrentBatch(List<Long> eventIds) {
    if (eventIds.isEmpty()) {
      return List.of();
    }
    Map<Long, CalendarEventDo> events =
        eventMapper.selectByIds(eventIds).stream()
            .collect(Collectors.toUnmodifiableMap(CalendarEventDo::getId, Function.identity()));
    Map<Long, EventRevisionDo> revisions =
        revisionMapper.selectPublishedByEventIds(eventIds).stream()
            .collect(
                Collectors.toUnmodifiableMap(EventRevisionDo::getEventId, Function.identity()));
    return eventIds.stream()
        .map(
            eventId -> {
              CalendarEventDo event = events.get(eventId);
              EventRevisionDo revision = revisions.get(eventId);
              if (event == null || revision == null) {
                throw new IllegalStateException("事件分页回读不一致");
              }
              return toSnapshot(event, revision);
            })
        .toList();
  }

  @Override
  public Optional<CalendarEventSnapshot> findManaged(Long eventId) {
    CalendarEventDo event = eventMapper.selectById(eventId);
    if (event == null || !EventKind.MANAGED.name().equals(event.getEventKind())) {
      return Optional.empty();
    }
    EventRevisionDo revision = revisionMapper.selectDraft(eventId);
    if (revision == null) {
      revision = revisionMapper.selectPublished(eventId);
    }
    if (revision == null) {
      revision = revisionMapper.selectLatest(eventId);
    }
    return revision == null ? Optional.empty() : Optional.of(toSnapshot(event, revision));
  }

  @Override
  public PageResult<CalendarEventSnapshot> pageManaged(Long calendarId, int page, int size) {
    PageResult<CalendarEventDo> events = eventMapper.selectManagedPage(calendarId, page, size);
    return events.map(
        event ->
            findManaged(event.getId())
                .orElseThrow(() -> new IllegalStateException("托管事件管理分页回读不一致")));
  }

  @Override
  @Transactional
  public CalendarEventSnapshot createPrivate(PrivateEventCreate command) {
    CalendarEventDo event = new CalendarEventDo();
    event.setCalendarId(command.calendarId());
    event.setEventKind(EventKind.PRIVATE.name());
    event.setOwnerUserId(command.ownerUserId());
    event.setSourceKind(EventSourceKind.USER.name());
    event.setState(EventState.ACTIVE.name());
    eventMapper.insert(event);

    EventRevisionDo revision =
        newRevision(
            event.getId(),
            1,
            EventRevisionState.PUBLISHED,
            command.content(),
            command.contentHash(),
            command.actor());
    revisionMapper.insert(revision);
    return toSnapshot(
        eventMapper.selectById(event.getId()), revisionMapper.selectPublished(event.getId()));
  }

  @Override
  @Transactional
  public CalendarEventSnapshot updatePrivate(PrivateEventUpdate command) {
    CalendarEventDo event = requireOwnedPrivateForUpdate(command.eventId(), command.ownerUserId());
    if (event.getVersion() != command.expectedVersion()) {
      throw new BizException(ErrorCode.CONFLICT);
    }
    EventRevisionDo current = revisionMapper.selectPublishedForUpdate(event.getId());
    if (current == null) {
      throw new IllegalStateException("私人事件缺少当前发布修订");
    }
    ConcurrencyGuard.requireSingleRow(
        eventMapper.updatePrivate(
            event.getId(),
            command.calendarId(),
            command.ownerUserId(),
            command.expectedVersion(),
            command.actor()));
    ConcurrencyGuard.requireSingleRow(
        revisionMapper.supersedePublished(current.getId(), command.actor()));
    revisionMapper.insert(
        newRevision(
            event.getId(),
            current.getRevisionNo() + 1,
            EventRevisionState.PUBLISHED,
            command.content(),
            command.contentHash(),
            command.actor()));
    return findCurrent(event.getId()).orElseThrow(() -> new IllegalStateException("私人事件更新后无法回读"));
  }

  @Override
  @Transactional
  public void deletePrivate(Long eventId, Long ownerUserId, String actor) {
    CalendarEventDo event = requireOwnedPrivateForUpdate(eventId, ownerUserId);
    EventRevisionDo current = revisionMapper.selectPublishedForUpdate(event.getId());
    if (current == null) {
      throw new IllegalStateException("私人事件缺少当前发布修订");
    }
    ConcurrencyGuard.requireSingleRow(revisionMapper.supersedePublished(current.getId(), actor));
    EventRevisionDo cancelled =
        newRevision(
            event.getId(),
            current.getRevisionNo() + 1,
            EventRevisionState.CANCELLED,
            toContent(current),
            current.getContentHash(),
            actor);
    cancelled.setClosedAt(LocalDateTime.now());
    cancelled.setClosedBy(actor);
    revisionMapper.insert(cancelled);
    ConcurrencyGuard.requireSingleRow(eventMapper.cancelPrivate(eventId, ownerUserId, actor));
  }

  @Override
  @Transactional
  public CalendarEventSnapshot createManagedDraft(ManagedEventDraftCreate command) {
    CalendarEventDo event = new CalendarEventDo();
    event.setCalendarId(command.calendarId());
    event.setEventKind(EventKind.MANAGED.name());
    event.setSourceKind(EventSourceKind.USER.name());
    event.setState(EventState.ACTIVE.name());
    eventMapper.insert(event);
    revisionMapper.insert(
        newRevision(
            event.getId(),
            1,
            EventRevisionState.DRAFT,
            command.content(),
            command.contentHash(),
            command.actor()));
    return findManaged(event.getId()).orElseThrow(() -> new IllegalStateException("托管事件草稿创建后无法回读"));
  }

  @Override
  @Transactional
  public CalendarEventSnapshot saveManagedDraft(ManagedEventDraftSave command) {
    CalendarEventDo event = requireManagedForUpdate(command.calendarId(), command.eventId());
    if (event.getSourceKind().equals(EventSourceKind.PROJECTION.name())) {
      throw sourceManagedEvent();
    }
    EventRevisionDo draft = revisionMapper.selectDraftForUpdate(event.getId());
    if (draft == null) {
      if (command.expectedDraftVersion() != 0) {
        throw new BizException(ErrorCode.CONFLICT);
      }
      EventRevisionDo created =
          newRevision(
              event.getId(),
              revisionMapper.selectMaxRevisionNo(event.getId()) + 1,
              EventRevisionState.DRAFT,
              command.content(),
              command.contentHash(),
              command.actor());
      // Retained (including discarded) history prevents a stale approval from matching a new draft.
      created.setVersion(Math.incrementExact(revisionMapper.selectMaxVersion(event.getId())));
      revisionMapper.insert(created);
    } else {
      if (draft.getVersion() != command.expectedDraftVersion()) {
        throw new BizException(ErrorCode.CONFLICT);
      }
      copyContent(draft, command.content());
      draft.setContentHash(command.contentHash());
      ConcurrencyGuard.requireSingleRow(
          revisionMapper.updateDraft(draft, command.expectedDraftVersion(), command.actor()));
    }
    return findManaged(event.getId()).orElseThrow(() -> new IllegalStateException("托管事件草稿保存后无法回读"));
  }

  @Override
  @Transactional
  public void discardManagedDraft(Long calendarId, Long eventId, String actor) {
    requireManagedForUpdate(calendarId, eventId);
    EventRevisionDo draft = revisionMapper.selectDraftForUpdate(eventId);
    if (draft == null) {
      throw revisionStateInvalid();
    }
    ConcurrencyGuard.requireSingleRow(revisionMapper.deleteDraft(draft.getId(), actor));
    if (revisionMapper.selectLatest(eventId) == null) {
      ConcurrencyGuard.requireSingleRow(eventMapper.deleteEmptyManaged(eventId, calendarId, actor));
    }
  }

  @Override
  @Transactional
  public CalendarEventSnapshot publishManaged(ManagedEventPublish command) {
    CalendarEventDo event = requireManagedForUpdate(command.calendarId(), command.eventId());
    EventRevisionDo draft = revisionMapper.selectDraftForUpdate(event.getId());
    if (draft == null) {
      throw revisionStateInvalid();
    }
    if (draft.getVersion() != command.expectedDraftVersion()
        || !draft.getContentHash().equals(command.expectedContentHash())) {
      throw new BizException(ErrorCode.CONFLICT);
    }
    if (!EventContentHasher.hash(toContent(draft)).equals(draft.getContentHash())) {
      throw new BizException(ErrorCode.CONFLICT.getCode(), "草稿使用旧版内容校验，请重新保存或由投影来源更新并复核后发布");
    }
    EventRevisionDo published = revisionMapper.selectPublishedForUpdate(event.getId());
    if (published != null) {
      ConcurrencyGuard.requireSingleRow(
          revisionMapper.supersedePublished(published.getId(), command.actor()));
    }
    ConcurrencyGuard.requireSingleRow(
        revisionMapper.publishDraft(
            draft.getId(), command.expectedDraftVersion(), command.actor()));
    ConcurrencyGuard.requireSingleRow(
        eventMapper.updateManagedState(
            event.getId(), command.calendarId(), EventState.ACTIVE.name(), command.actor()));
    return findCurrent(event.getId()).orElseThrow(() -> new IllegalStateException("托管事件发布后无法回读"));
  }

  @Override
  @Transactional
  public void withdrawManaged(Long calendarId, Long eventId, String actor) {
    CalendarEventDo event = requireManagedForUpdate(calendarId, eventId);
    EventRevisionDo published = revisionMapper.selectPublishedForUpdate(event.getId());
    if (published == null) {
      throw revisionStateInvalid();
    }
    ConcurrencyGuard.requireSingleRow(revisionMapper.withdrawPublished(published.getId(), actor));
    ConcurrencyGuard.requireSingleRow(
        eventMapper.updateManagedState(
            event.getId(), calendarId, EventState.WITHDRAWN.name(), actor));
  }

  @Override
  @Transactional
  public void cancelManaged(Long calendarId, Long eventId, String actor) {
    CalendarEventDo event = requireManagedForUpdate(calendarId, eventId);
    if (event.getSourceKind().equals(EventSourceKind.PROJECTION.name())) {
      throw sourceManagedEvent();
    }
    EventRevisionDo draft = revisionMapper.selectDraftForUpdate(event.getId());
    EventRevisionDo published = revisionMapper.selectPublishedForUpdate(event.getId());
    if (draft == null && published == null) {
      throw revisionStateInvalid();
    }
    if (draft != null) {
      ConcurrencyGuard.requireSingleRow(revisionMapper.cancelRevision(draft.getId(), actor));
    }
    if (published != null) {
      ConcurrencyGuard.requireSingleRow(revisionMapper.cancelRevision(published.getId(), actor));
    }
    ConcurrencyGuard.requireSingleRow(
        eventMapper.updateManagedState(
            event.getId(), calendarId, EventState.CANCELLED.name(), actor));
  }

  private CalendarEventDo requireOwnedPrivateForUpdate(Long eventId, Long ownerUserId) {
    CalendarEventDo event = eventMapper.selectForUpdate(eventId);
    if (event == null
        || !EventKind.PRIVATE.name().equals(event.getEventKind())
        || !ownerUserId.equals(event.getOwnerUserId())
        || !EventState.ACTIVE.name().equals(event.getState())) {
      throw new BizException(ErrorCode.NOT_FOUND);
    }
    return event;
  }

  private CalendarEventDo requireManagedForUpdate(Long calendarId, Long eventId) {
    CalendarEventDo event = eventMapper.selectForUpdate(eventId);
    if (event == null
        || !EventKind.MANAGED.name().equals(event.getEventKind())
        || !calendarId.equals(event.getCalendarId())
        || EventState.CANCELLED.name().equals(event.getState())) {
      throw new BizException(ErrorCode.NOT_FOUND);
    }
    return event;
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

  private static CalendarEventSnapshot toSnapshot(CalendarEventDo event, EventRevisionDo revision) {
    return new CalendarEventSnapshot(
        event.getId(),
        event.getCalendarId(),
        EventKind.valueOf(event.getEventKind()),
        event.getOwnerUserId(),
        EventSourceKind.valueOf(event.getSourceKind()),
        EventState.valueOf(event.getState()),
        event.getVersion(),
        new EventRevisionSnapshot(
            revision.getId(),
            revision.getEventId(),
            revision.getRevisionNo(),
            EventRevisionState.valueOf(revision.getState()),
            toContent(revision),
            revision.getContentHash(),
            revision.getVersion()));
  }

  private static EventContent toContent(EventRevisionDo value) {
    return new EventContent(
        value.getTitle(),
        value.getDescription(),
        value.getLocation(),
        EventTimeKind.valueOf(value.getTimeKind()),
        value.getStartDate(),
        value.getEndDateExclusive(),
        value.getStartAtUtc(),
        value.getEndAtUtc(),
        value.getZoneId());
  }

  private static BizException revisionStateInvalid() {
    CalendarErrorCode error = CalendarErrorCode.CALENDAR_REVISION_STATE_INVALID;
    return new BizException(error.getCode(), error.getMessage());
  }

  private static BizException sourceManagedEvent() {
    CalendarErrorCode error = CalendarErrorCode.CALENDAR_SOURCE_MANAGED_EVENT;
    return new BizException(error.getCode(), error.getMessage());
  }
}
