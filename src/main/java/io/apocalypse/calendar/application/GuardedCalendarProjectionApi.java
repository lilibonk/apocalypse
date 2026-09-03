package io.apocalypse.calendar.application;

import io.apocalypse.calendar.api.CalendarProjectionApi;
import io.apocalypse.calendar.api.CancelProjectionBatchCommand;
import io.apocalypse.calendar.api.ProjectionBatchCommand;
import io.apocalypse.calendar.api.ProjectionBatchResult;
import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

/** 常驻 facade：先执行 capability guard，再委派给内部实现，关闭能力不会造成依赖方启动失败。 */
@Service
@RequiredArgsConstructor
public class GuardedCalendarProjectionApi implements CalendarProjectionApi {

  private final CalendarCapabilityGuard capabilityGuard;

  private final ObjectProvider<ProjectionCommandHandler> handler;

  @Override
  public ProjectionBatchResult upsert(ProjectionBatchCommand command) {
    capabilityGuard.requireEnabled();
    return requireHandler().upsert(command);
  }

  @Override
  public ProjectionBatchResult cancel(CancelProjectionBatchCommand command) {
    capabilityGuard.requireEnabled();
    return requireHandler().cancel(command);
  }

  private ProjectionCommandHandler requireHandler() {
    ProjectionCommandHandler value = handler.getIfAvailable();
    if (value == null) {
      throw new BizException(ErrorCode.SYSTEM_ERROR.getCode(), "Calendar 投影实现尚未就绪");
    }
    return value;
  }
}
