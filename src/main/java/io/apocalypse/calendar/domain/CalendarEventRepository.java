package io.apocalypse.calendar.domain;

import io.apocalypse.common.response.PageResult;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface CalendarEventRepository {

  PageResult<CalendarEventSnapshot> pageVisible(
      Long calendarId,
      List<Long> managedCalendarIds,
      Long ownerUserId,
      LocalDate from,
      LocalDate toExclusive,
      LocalDateTime fromUtc,
      LocalDateTime toUtc,
      int page,
      int size);

  Optional<CalendarEventSnapshot> findCurrent(Long eventId);

  Optional<CalendarEventSnapshot> findManaged(Long eventId);

  PageResult<CalendarEventSnapshot> pageManaged(Long calendarId, int page, int size);

  CalendarEventSnapshot createPrivate(PrivateEventCreate command);

  CalendarEventSnapshot updatePrivate(PrivateEventUpdate command);

  void deletePrivate(Long eventId, Long ownerUserId, String actor);

  CalendarEventSnapshot createManagedDraft(ManagedEventDraftCreate command);

  CalendarEventSnapshot saveManagedDraft(ManagedEventDraftSave command);

  void discardManagedDraft(Long calendarId, Long eventId, String actor);

  CalendarEventSnapshot publishManaged(ManagedEventPublish command);

  void withdrawManaged(Long calendarId, Long eventId, String actor);

  void cancelManaged(Long calendarId, Long eventId, String actor);
}
