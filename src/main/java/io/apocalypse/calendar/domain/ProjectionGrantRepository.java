package io.apocalypse.calendar.domain;

import java.util.List;
import java.util.Optional;

public interface ProjectionGrantRepository {

  List<ProjectionGrantSnapshot> findByCalendar(Long calendarId);

  Optional<ProjectionGrantSnapshot> findActive(Long calendarId, String sourceSystem);

  ProjectionGrantSnapshot save(
      Long calendarId,
      String sourceSystem,
      ProjectionPublishMode publishMode,
      int expectedVersion,
      String actor);

  void deactivate(Long calendarId, String sourceSystem, String actor);
}
