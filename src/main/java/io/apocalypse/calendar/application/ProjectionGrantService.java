package io.apocalypse.calendar.application;

import io.apocalypse.calendar.domain.CalendarRole;
import io.apocalypse.calendar.domain.ProjectionGrantRepository;
import io.apocalypse.calendar.domain.ProjectionGrantSnapshot;
import io.apocalypse.calendar.interfaces.dto.request.ProjectionGrantSaveReq;
import io.apocalypse.calendar.interfaces.dto.response.ProjectionGrantResp;
import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;

import java.util.List;
import java.util.regex.Pattern;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class ProjectionGrantService {

  private static final Pattern SOURCE_SYSTEM = Pattern.compile("[A-Za-z0-9._-]{1,64}");

  private final CalendarCapabilityGuard capabilityGuard;

  private final CalendarAccessService calendarAccessService;

  private final ProjectionGrantRepository projectionGrantRepository;

  @Transactional(readOnly = true)
  public List<ProjectionGrantResp> list(Long calendarId, Long userId) {
    capabilityGuard.requireEnabled();
    calendarAccessService.requireRole(calendarId, userId, CalendarRole.PUBLISHER);
    return projectionGrantRepository.findByCalendar(calendarId).stream()
        .map(ProjectionGrantService::toResponse)
        .toList();
  }

  @Transactional
  public ProjectionGrantResp save(
      Long calendarId,
      String sourceSystem,
      ProjectionGrantSaveReq request,
      Long userId,
      String actor) {
    capabilityGuard.requireEnabled();
    calendarAccessService.requireRole(calendarId, userId, CalendarRole.PUBLISHER);
    requireSourceSystem(sourceSystem);
    if (request == null || request.publishMode() == null) {
      throw new BizException(ErrorCode.PARAM_INVALID);
    }
    return toResponse(
        projectionGrantRepository.save(
            calendarId, sourceSystem, request.publishMode(), request.expectedVersion(), actor));
  }

  @Transactional
  public void deactivate(Long calendarId, String sourceSystem, Long userId, String actor) {
    capabilityGuard.requireEnabled();
    calendarAccessService.requireRole(calendarId, userId, CalendarRole.PUBLISHER);
    requireSourceSystem(sourceSystem);
    projectionGrantRepository.deactivate(calendarId, sourceSystem, actor);
  }

  private static void requireSourceSystem(String value) {
    if (value == null || !SOURCE_SYSTEM.matcher(value).matches()) {
      throw new BizException(ErrorCode.PARAM_INVALID);
    }
  }

  private static ProjectionGrantResp toResponse(ProjectionGrantSnapshot value) {
    return new ProjectionGrantResp(
        value.id(),
        value.calendarId(),
        value.sourceSystem(),
        value.publishMode(),
        value.state(),
        value.version());
  }
}
