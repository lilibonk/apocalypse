package io.apocalypse.calendar.application;

import io.apocalypse.calendar.api.CalendarErrorCode;
import io.apocalypse.calendar.api.CancelProjectedEventCommand;
import io.apocalypse.calendar.api.CancelProjectionBatchCommand;
import io.apocalypse.calendar.api.ProjectedEventCommand;
import io.apocalypse.calendar.api.ProjectionBatchCommand;
import io.apocalypse.calendar.api.ProjectionBatchResult;
import io.apocalypse.calendar.api.ProjectionItemResult;
import io.apocalypse.calendar.domain.CalendarContext;
import io.apocalypse.calendar.domain.CalendarContextRepository;
import io.apocalypse.calendar.domain.CalendarKind;
import io.apocalypse.calendar.domain.CalendarState;
import io.apocalypse.calendar.domain.EventContent;
import io.apocalypse.calendar.domain.EventContentHasher;
import io.apocalypse.calendar.domain.PreparedProjectionEvent;
import io.apocalypse.calendar.domain.ProjectionEventRepository;
import io.apocalypse.calendar.domain.ProjectionGrantRepository;
import io.apocalypse.calendar.domain.ProjectionGrantSnapshot;
import io.apocalypse.calendar.domain.ProjectionSourceIdentity;
import io.apocalypse.calendar.domain.ProjectionSourceSnapshot;
import io.apocalypse.calendar.domain.ProjectionSourceState;
import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
@ConditionalOnProperty(
    prefix = "apocalypse.capabilities.calendar",
    name = "enabled",
    havingValue = "true")
public class DefaultProjectionCommandHandler implements ProjectionCommandHandler {

  private static final int MAX_BATCH_SIZE = 500;

  private static final Pattern SOURCE_SYSTEM = Pattern.compile("[A-Za-z0-9._-]{1,64}");

  private static final Pattern SOURCE_TYPE = Pattern.compile("[A-Za-z0-9._-]{1,64}");

  private static final Pattern SOURCE_KEY = Pattern.compile("[A-Za-z0-9._:/-]{1,128}");

  private final CalendarContextRepository calendarContextRepository;

  private final ProjectionGrantRepository projectionGrantRepository;

  private final ProjectionEventRepository projectionEventRepository;

  private final EventContentNormalizer contentNormalizer;

  @Override
  @Transactional
  public ProjectionBatchResult upsert(ProjectionBatchCommand command) {
    CalendarContext target = requireTarget(command);
    ProjectionGrantSnapshot grant = requireGrant(target, command.sourceSystem());
    List<PreparedProjectionEvent> events = prepare(command.events());
    projectionEventRepository.lockSources(
        command.sourceSystem(),
        events.stream()
            .map(event -> new ProjectionSourceIdentity(event.sourceType(), event.sourceKey()))
            .toList());
    events.forEach(event -> preflightUpsert(target.id(), command.sourceSystem(), event));
    List<ProjectionItemResult> results =
        events.stream()
            .map(
                event ->
                    projectionEventRepository.upsert(
                        target.id(),
                        command.sourceSystem(),
                        grant.publishMode(),
                        event,
                        command.sourceSystem()))
            .toList();
    return new ProjectionBatchResult(results);
  }

  @Override
  @Transactional
  public ProjectionBatchResult cancel(CancelProjectionBatchCommand command) {
    CalendarContext target = requireTarget(command);
    requireGrant(target, command.sourceSystem());
    List<CancelProjectedEventCommand> events = requireCancelEvents(command.events());
    projectionEventRepository.lockSources(
        command.sourceSystem(),
        events.stream()
            .map(event -> new ProjectionSourceIdentity(event.sourceType(), event.sourceKey()))
            .toList());
    events.forEach(event -> preflightCancel(target.id(), command.sourceSystem(), event));
    List<ProjectionItemResult> results =
        events.stream()
            .map(
                event ->
                    projectionEventRepository.cancel(
                        target.id(), command.sourceSystem(), event, command.sourceSystem()))
            .toList();
    return new ProjectionBatchResult(results);
  }

  private CalendarContext requireTarget(ProjectionBatchCommand command) {
    if (command == null) {
      throw new BizException(ErrorCode.PARAM_INVALID);
    }
    return requireTarget(command.sourceSystem(), command.targetCalendarKey());
  }

  private CalendarContext requireTarget(CancelProjectionBatchCommand command) {
    if (command == null) {
      throw new BizException(ErrorCode.PARAM_INVALID);
    }
    return requireTarget(command.sourceSystem(), command.targetCalendarKey());
  }

  private CalendarContext requireTarget(String sourceSystem, String calendarKey) {
    if (sourceSystem == null
        || !SOURCE_SYSTEM.matcher(sourceSystem).matches()
        || calendarKey == null) {
      throw new BizException(ErrorCode.PARAM_INVALID);
    }
    return calendarContextRepository
        .findByKey(calendarKey)
        .filter(calendar -> calendar.kind() == CalendarKind.MANAGED)
        .filter(calendar -> calendar.state() != CalendarState.ARCHIVED)
        .orElseThrow(() -> new BizException(ErrorCode.NOT_FOUND));
  }

  private ProjectionGrantSnapshot requireGrant(CalendarContext target, String sourceSystem) {
    return projectionGrantRepository
        .findActive(target.id(), sourceSystem)
        .orElseThrow(DefaultProjectionCommandHandler::projectionNotGranted);
  }

  private List<PreparedProjectionEvent> prepare(List<ProjectedEventCommand> commands) {
    requireBatch(commands);
    Set<SourceIdentity> identities = new HashSet<>();
    return commands.stream()
        .map(
            command -> {
              requireIdentity(
                  command == null ? null : command.sourceType(),
                  command == null ? null : command.sourceKey(),
                  command == null ? -1 : command.sourceVersion(),
                  identities);
              EventContent content = contentNormalizer.normalize(command.content());
              return new PreparedProjectionEvent(
                  command.sourceType(),
                  command.sourceKey(),
                  command.sourceVersion(),
                  content,
                  EventContentHasher.hash(content));
            })
        .toList();
  }

  private static List<CancelProjectedEventCommand> requireCancelEvents(
      List<CancelProjectedEventCommand> commands) {
    requireBatch(commands);
    Set<SourceIdentity> identities = new HashSet<>();
    commands.forEach(
        command ->
            requireIdentity(
                command == null ? null : command.sourceType(),
                command == null ? null : command.sourceKey(),
                command == null ? -1 : command.sourceVersion(),
                identities));
    return List.copyOf(commands);
  }

  private void preflightUpsert(
      Long calendarId, String sourceSystem, PreparedProjectionEvent event) {
    projectionEventRepository
        .find(sourceSystem, event.sourceType(), event.sourceKey())
        .ifPresent(
            source -> {
              requireSameCalendar(source, calendarId);
              if (source.state() == ProjectionSourceState.CANCELLED) {
                throw revisionStateInvalid();
              }
              if (source.sourceVersion() == event.sourceVersion()
                  && !source.payloadHash().equals(event.payloadHash())) {
                throw versionConflict();
              }
            });
  }

  private void preflightCancel(
      Long calendarId, String sourceSystem, CancelProjectedEventCommand event) {
    ProjectionSourceSnapshot source =
        projectionEventRepository
            .find(sourceSystem, event.sourceType(), event.sourceKey())
            .orElseThrow(DefaultProjectionCommandHandler::revisionStateInvalid);
    requireSameCalendar(source, calendarId);
    if (source.state() == ProjectionSourceState.ACTIVE
        && source.sourceVersion() == event.sourceVersion()) {
      throw versionConflict();
    }
  }

  private static void requireSameCalendar(ProjectionSourceSnapshot source, Long calendarId) {
    if (!source.calendarId().equals(calendarId)) {
      throw versionConflict();
    }
  }

  private static void requireBatch(List<?> commands) {
    if (commands == null || commands.isEmpty()) {
      throw new BizException(ErrorCode.PARAM_INVALID);
    }
    if (commands.size() > MAX_BATCH_SIZE) {
      CalendarErrorCode error = CalendarErrorCode.CALENDAR_BATCH_LIMIT_EXCEEDED;
      throw new BizException(error.getCode(), error.getMessage());
    }
  }

  private static void requireIdentity(
      String sourceType, String sourceKey, long sourceVersion, Set<SourceIdentity> identities) {
    SourceIdentity identity = new SourceIdentity(sourceType, sourceKey);
    if (sourceType == null
        || !SOURCE_TYPE.matcher(sourceType).matches()
        || sourceKey == null
        || !SOURCE_KEY.matcher(sourceKey).matches()
        || sourceVersion < 0
        || !identities.add(identity)) {
      throw new BizException(ErrorCode.PARAM_INVALID);
    }
  }

  private static BizException projectionNotGranted() {
    CalendarErrorCode error = CalendarErrorCode.CALENDAR_PROJECTION_NOT_GRANTED;
    return new BizException(error.getCode(), error.getMessage());
  }

  private static BizException versionConflict() {
    CalendarErrorCode error = CalendarErrorCode.CALENDAR_PROJECTION_VERSION_CONFLICT;
    return new BizException(error.getCode(), error.getMessage());
  }

  private static BizException revisionStateInvalid() {
    CalendarErrorCode error = CalendarErrorCode.CALENDAR_REVISION_STATE_INVALID;
    return new BizException(error.getCode(), error.getMessage());
  }

  private record SourceIdentity(String sourceType, String sourceKey) {}
}
