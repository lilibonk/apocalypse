package io.apocalypse.calendar.application;

import io.apocalypse.calendar.domain.CalendarEventRepository;
import io.apocalypse.calendar.domain.CalendarEventSnapshot;
import io.apocalypse.calendar.domain.CalendarRole;
import io.apocalypse.calendar.domain.EventContent;
import io.apocalypse.calendar.domain.EventContentHasher;
import io.apocalypse.calendar.domain.ManagedEventDraftCreate;
import io.apocalypse.calendar.domain.ManagedEventDraftSave;
import io.apocalypse.calendar.domain.ManagedEventPublish;
import io.apocalypse.calendar.interfaces.dto.request.EventPublishReq;
import io.apocalypse.calendar.interfaces.dto.request.ManagedEventCreateReq;
import io.apocalypse.calendar.interfaces.dto.request.ManagedEventDraftSaveReq;
import io.apocalypse.calendar.interfaces.dto.response.CalendarEventResp;
import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.common.response.PageResult;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class ManagedEventService {

  private final CalendarCapabilityGuard capabilityGuard;

  private final CalendarAccessService calendarAccessService;

  private final CalendarEventRepository eventRepository;

  private final EventContentNormalizer contentNormalizer;

  @Transactional(readOnly = true)
  public PageResult<CalendarEventResp> page(Long calendarId, int page, int size, Long userId) {
    capabilityGuard.requireEnabled();
    calendarAccessService.requireRole(calendarId, userId, CalendarRole.EDITOR);
    return eventRepository
        .pageManaged(calendarId, page, size)
        .map(CalendarEventResponseMapper::toResponse);
  }

  @Transactional
  public CalendarEventResp createDraft(
      Long calendarId, ManagedEventCreateReq request, Long userId, String actor) {
    capabilityGuard.requireEnabled();
    calendarAccessService.requireRole(calendarId, userId, CalendarRole.EDITOR);
    if (request == null) {
      throw new BizException(ErrorCode.PARAM_INVALID);
    }
    EventContent content = contentNormalizer.normalize(request.content());
    CalendarEventSnapshot event =
        eventRepository.createManagedDraft(
            new ManagedEventDraftCreate(
                calendarId, content, EventContentHasher.hash(content), actor));
    return CalendarEventResponseMapper.toResponse(event);
  }

  @Transactional
  public CalendarEventResp saveDraft(
      Long calendarId, Long eventId, ManagedEventDraftSaveReq request, Long userId, String actor) {
    capabilityGuard.requireEnabled();
    calendarAccessService.requireRole(calendarId, userId, CalendarRole.EDITOR);
    if (request == null) {
      throw new BizException(ErrorCode.PARAM_INVALID);
    }
    EventContent content = contentNormalizer.normalize(request.content());
    CalendarEventSnapshot event =
        eventRepository.saveManagedDraft(
            new ManagedEventDraftSave(
                calendarId,
                eventId,
                request.expectedDraftVersion(),
                content,
                EventContentHasher.hash(content),
                actor));
    return CalendarEventResponseMapper.toResponse(event);
  }

  @Transactional
  public void discardDraft(Long calendarId, Long eventId, Long userId, String actor) {
    capabilityGuard.requireEnabled();
    calendarAccessService.requireRole(calendarId, userId, CalendarRole.EDITOR);
    eventRepository.discardManagedDraft(calendarId, eventId, actor);
  }

  @Transactional
  public CalendarEventResp publish(
      Long calendarId, Long eventId, EventPublishReq request, Long userId, String actor) {
    capabilityGuard.requireEnabled();
    calendarAccessService.requireRole(calendarId, userId, CalendarRole.PUBLISHER);
    if (request == null || request.expectedContentHash() == null) {
      throw new BizException(ErrorCode.PARAM_INVALID);
    }
    CalendarEventSnapshot event =
        eventRepository.publishManaged(
            new ManagedEventPublish(
                calendarId,
                eventId,
                request.expectedDraftVersion(),
                request.expectedContentHash(),
                actor));
    return CalendarEventResponseMapper.toResponse(event);
  }

  @Transactional
  public void withdraw(Long calendarId, Long eventId, Long userId, String actor) {
    capabilityGuard.requireEnabled();
    calendarAccessService.requireRole(calendarId, userId, CalendarRole.PUBLISHER);
    eventRepository.withdrawManaged(calendarId, eventId, actor);
  }

  @Transactional
  public void cancel(Long calendarId, Long eventId, Long userId, String actor) {
    capabilityGuard.requireEnabled();
    calendarAccessService.requireRole(calendarId, userId, CalendarRole.PUBLISHER);
    eventRepository.cancelManaged(calendarId, eventId, actor);
  }
}
