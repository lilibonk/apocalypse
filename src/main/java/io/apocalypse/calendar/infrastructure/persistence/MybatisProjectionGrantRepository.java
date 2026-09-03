package io.apocalypse.calendar.infrastructure.persistence;

import io.apocalypse.calendar.api.CalendarErrorCode;
import io.apocalypse.calendar.domain.ProjectionGrantRepository;
import io.apocalypse.calendar.domain.ProjectionGrantSnapshot;
import io.apocalypse.calendar.domain.ProjectionGrantState;
import io.apocalypse.calendar.domain.ProjectionPublishMode;
import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.exception.ConcurrencyGuard;
import io.apocalypse.common.response.ErrorCode;

import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

@Repository
@RequiredArgsConstructor
public class MybatisProjectionGrantRepository implements ProjectionGrantRepository {

  private final ProjectionGrantMapper mapper;

  @Override
  public List<ProjectionGrantSnapshot> findByCalendar(Long calendarId) {
    return mapper.selectByCalendar(calendarId).stream().map(this::toSnapshot).toList();
  }

  @Override
  public Optional<ProjectionGrantSnapshot> findActive(Long calendarId, String sourceSystem) {
    return Optional.ofNullable(mapper.selectActive(calendarId, sourceSystem)).map(this::toSnapshot);
  }

  @Override
  @Transactional
  public ProjectionGrantSnapshot save(
      Long calendarId,
      String sourceSystem,
      ProjectionPublishMode publishMode,
      int expectedVersion,
      String actor) {
    mapper.lockScope(calendarId, sourceSystem);
    ProjectionGrantDo current = mapper.selectForUpdate(calendarId, sourceSystem);
    int actualVersion = current == null ? 0 : current.getVersion();
    if (expectedVersion != actualVersion) {
      throw new BizException(ErrorCode.CONFLICT);
    }
    if (current == null) {
      current = new ProjectionGrantDo();
      current.setCalendarId(calendarId);
      current.setSourceSystem(sourceSystem);
      current.setPublishMode(publishMode.name());
      current.setState(ProjectionGrantState.ACTIVE.name());
      mapper.insert(current);
    } else {
      ConcurrencyGuard.requireSingleRow(
          mapper.activate(current.getId(), publishMode.name(), expectedVersion, actor));
    }
    return findActive(calendarId, sourceSystem)
        .orElseThrow(() -> new IllegalStateException("投影授权保存后无法回读"));
  }

  @Override
  @Transactional
  public void deactivate(Long calendarId, String sourceSystem, String actor) {
    mapper.lockScope(calendarId, sourceSystem);
    ProjectionGrantDo current = mapper.selectForUpdate(calendarId, sourceSystem);
    if (current == null || !ProjectionGrantState.ACTIVE.name().equals(current.getState())) {
      throw stateInvalid();
    }
    ConcurrencyGuard.requireSingleRow(mapper.deactivate(current.getId(), actor));
  }

  private ProjectionGrantSnapshot toSnapshot(ProjectionGrantDo value) {
    return new ProjectionGrantSnapshot(
        value.getId(),
        value.getCalendarId(),
        value.getSourceSystem(),
        ProjectionPublishMode.valueOf(value.getPublishMode()),
        ProjectionGrantState.valueOf(value.getState()),
        value.getVersion());
  }

  private static BizException stateInvalid() {
    CalendarErrorCode error = CalendarErrorCode.CALENDAR_REVISION_STATE_INVALID;
    return new BizException(error.getCode(), error.getMessage());
  }
}
