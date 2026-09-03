package io.apocalypse.calendar.application;

import io.apocalypse.calendar.api.CalendarErrorCode;
import io.apocalypse.calendar.domain.CalendarContext;
import io.apocalypse.calendar.domain.CalendarEventRepository;
import io.apocalypse.calendar.domain.CalendarEventSnapshot;
import io.apocalypse.calendar.domain.CalendarKind;
import io.apocalypse.calendar.domain.EventContent;
import io.apocalypse.calendar.domain.EventContentHasher;
import io.apocalypse.calendar.domain.EventKind;
import io.apocalypse.calendar.domain.PrivateEventCreate;
import io.apocalypse.calendar.domain.PrivateEventUpdate;
import io.apocalypse.calendar.interfaces.dto.request.PrivateEventCreateReq;
import io.apocalypse.calendar.interfaces.dto.request.PrivateEventUpdateReq;
import io.apocalypse.calendar.interfaces.dto.response.CalendarEventResp;
import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.common.response.PageResult;

import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class PrivateEventService {

  private static final int MAX_RANGE_DAYS = 366;

  private final CalendarCapabilityGuard capabilityGuard;

  private final CalendarAccessService calendarAccessService;

  private final CalendarEventRepository eventRepository;

  private final EventContentNormalizer contentNormalizer;

  @Transactional(readOnly = true)
  public PageResult<CalendarEventResp> page(
      Long calendarId, LocalDate from, LocalDate to, int page, int size, Long userId) {
    capabilityGuard.requireEnabled();
    requireRange(from, to);
    CalendarContext target = calendarAccessService.requireVisible(calendarId, userId);
    List<Long> managedScopes =
        calendarAccessService.hierarchy(target).stream()
            .filter(calendar -> calendar.kind() == CalendarKind.MANAGED)
            .map(CalendarContext::id)
            .toList();
    ZoneId zoneId = requireZoneId(target.zoneId());
    LocalDate toExclusive = to.plusDays(1);
    LocalDateTime fromUtc =
        LocalDateTime.ofInstant(from.atStartOfDay(zoneId).toInstant(), ZoneOffset.UTC);
    LocalDateTime toUtc =
        LocalDateTime.ofInstant(toExclusive.atStartOfDay(zoneId).toInstant(), ZoneOffset.UTC);
    return eventRepository
        .pageVisible(
            calendarId, managedScopes, userId, from, toExclusive, fromUtc, toUtc, page, size)
        .map(CalendarEventResponseMapper::toResponse);
  }

  @Transactional(readOnly = true)
  public CalendarEventResp detail(Long eventId, Long userId) {
    capabilityGuard.requireEnabled();
    CalendarEventSnapshot event = eventRepository.findCurrent(eventId).orElseThrow(this::notFound);
    if (event.kind() == EventKind.PRIVATE) {
      if (!userId.equals(event.ownerUserId())) {
        throw notFound();
      }
    } else {
      calendarAccessService.requireVisible(event.calendarId(), userId);
    }
    return CalendarEventResponseMapper.toResponse(event);
  }

  @Transactional
  public CalendarEventResp create(PrivateEventCreateReq request, Long userId, String actor) {
    capabilityGuard.requireEnabled();
    if (request == null || request.calendarId() == null) {
      throw new BizException(ErrorCode.PARAM_INVALID);
    }
    calendarAccessService.requireVisible(request.calendarId(), userId);
    EventContent content = contentNormalizer.normalize(request.content());
    CalendarEventSnapshot event =
        eventRepository.createPrivate(
            new PrivateEventCreate(
                request.calendarId(), userId, content, EventContentHasher.hash(content), actor));
    return CalendarEventResponseMapper.toResponse(event);
  }

  @Transactional
  public CalendarEventResp update(
      Long eventId, PrivateEventUpdateReq request, Long userId, String actor) {
    capabilityGuard.requireEnabled();
    if (request == null || request.calendarId() == null) {
      throw new BizException(ErrorCode.PARAM_INVALID);
    }
    calendarAccessService.requireVisible(request.calendarId(), userId);
    EventContent content = contentNormalizer.normalize(request.content());
    CalendarEventSnapshot event =
        eventRepository.updatePrivate(
            new PrivateEventUpdate(
                eventId,
                request.calendarId(),
                userId,
                request.expectedVersion(),
                content,
                EventContentHasher.hash(content),
                actor));
    return CalendarEventResponseMapper.toResponse(event);
  }

  @Transactional
  public void delete(Long eventId, Long userId, String actor) {
    capabilityGuard.requireEnabled();
    eventRepository.deletePrivate(eventId, userId, actor);
  }

  private static void requireRange(LocalDate from, LocalDate to) {
    if (from == null || to == null || from.isAfter(to)) {
      throw new BizException(ErrorCode.PARAM_INVALID.getCode(), "日期范围无效");
    }
    if (ChronoUnit.DAYS.between(from, to) + 1 > MAX_RANGE_DAYS) {
      CalendarErrorCode error = CalendarErrorCode.CALENDAR_BATCH_LIMIT_EXCEEDED;
      throw new BizException(error.getCode(), error.getMessage());
    }
  }

  private static ZoneId requireZoneId(String value) {
    try {
      return ZoneId.of(value);
    } catch (DateTimeException | NullPointerException e) {
      CalendarErrorCode error = CalendarErrorCode.CALENDAR_TIME_ZONE_INVALID;
      throw new BizException(error.getCode(), error.getMessage());
    }
  }

  private BizException notFound() {
    return new BizException(ErrorCode.NOT_FOUND);
  }
}
