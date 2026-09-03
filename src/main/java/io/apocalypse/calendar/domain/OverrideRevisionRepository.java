package io.apocalypse.calendar.domain;

import io.apocalypse.common.response.PageResult;

import java.time.LocalDate;
import java.util.Optional;

public interface OverrideRevisionRepository {

  void lockManagedScope(Long calendarId);

  void lockPublishedPersonal(Long calendarId, Long ownerUserId);

  Optional<OverrideRevisionSnapshot> findPublished(
      Long calendarId, OverrideScope scope, Long ownerUserId);

  Optional<OverrideRevisionSnapshot> findPublishedForRange(
      Long calendarId, OverrideScope scope, Long ownerUserId, LocalDate from, LocalDate to);

  Optional<OverrideRevisionSnapshot> findDraftManaged(Long calendarId);

  PageResult<OverrideRevisionSnapshot> pageManaged(Long calendarId, int page, int size);

  OverrideRevisionSnapshot replacePublishedPersonal(PersonalOverrideReplacement replacement);

  OverrideRevisionSnapshot replaceManagedDraft(ManagedDraftReplacement replacement);

  void discardManagedDraft(Long calendarId, String actor);

  OverrideRevisionSnapshot publishManagedDraft(ManagedDraftPublish publish);

  void withdrawPublishedManaged(Long calendarId, Long revisionId, String actor);
}
