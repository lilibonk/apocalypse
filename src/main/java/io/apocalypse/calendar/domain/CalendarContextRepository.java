package io.apocalypse.calendar.domain;

import java.util.List;
import java.util.Optional;

public interface CalendarContextRepository {

  CalendarContext save(CalendarContext context);

  Optional<CalendarContext> findById(Long id);

  Optional<CalendarContext> findByKey(String calendarKey);

  Optional<CalendarContext> findSystemByRegion(String regionCode);

  List<CalendarContext> findVisibleByUserId(Long userId);

  Optional<CalendarRole> findActiveRole(Long calendarId, Long userId);

  void lockHierarchy(String regionCode);

  /** Deepest descendant relative to this node, capped at eight for fail-closed validation. */
  int descendantDepth(Long calendarId);
}
