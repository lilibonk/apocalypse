package io.apocalypse.calendar.domain;

import io.apocalypse.common.response.PageResult;

import java.util.List;
import java.util.Optional;

public interface CalendarMemberRepository {

  Optional<CalendarMemberSnapshot> findActive(Long calendarId, Long userId);

  CalendarMemberSnapshot save(CalendarMemberSnapshot member);

  void delete(CalendarMemberSnapshot member);

  List<CalendarMemberSnapshot> lockActiveMembers(Long calendarId);

  PageResult<CalendarMemberSnapshot> pageActive(Long calendarId, int page, int size);
}
