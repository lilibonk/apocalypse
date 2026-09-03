package io.apocalypse.calendar.domain;

import io.apocalypse.common.response.PageResult;

import java.util.List;
import java.util.Map;
import java.util.Optional;

public interface OverrideConflictRepository {

  Optional<OverrideConflictSnapshot> findLatestForItem(Long overrideItemId);

  Map<Long, OverrideConflictSnapshot> findLatestForItems(List<Long> overrideItemIds);

  void create(OverrideConflictCreate conflict);

  PageResult<OverrideConflictSnapshot> pageCurrent(
      Long calendarId, OverrideScope scope, Long ownerUserId, int page, int size);

  List<OverrideConflictSnapshot> findOpenCurrent(
      Long calendarId, OverrideScope scope, Long ownerUserId);

  Optional<OverrideConflictSnapshot> findCurrentById(
      Long conflictId, Long calendarId, OverrideScope scope, Long ownerUserId);

  void resolve(
      Long conflictId, OverrideConflictRecordState state, Long resolutionRevisionId, String actor);
}
