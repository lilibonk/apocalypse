package io.apocalypse.calendar.domain;

import io.apocalypse.calendar.api.CancelProjectedEventCommand;
import io.apocalypse.calendar.api.ProjectionItemResult;

import java.util.List;
import java.util.Optional;

public interface ProjectionEventRepository {

  void lockSources(String sourceSystem, List<ProjectionSourceIdentity> identities);

  Optional<ProjectionSourceSnapshot> find(String sourceSystem, String sourceType, String sourceKey);

  ProjectionItemResult upsert(
      Long calendarId,
      String sourceSystem,
      ProjectionPublishMode publishMode,
      PreparedProjectionEvent event,
      String actor);

  ProjectionItemResult cancel(
      Long calendarId, String sourceSystem, CancelProjectedEventCommand event, String actor);
}
