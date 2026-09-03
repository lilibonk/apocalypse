package io.apocalypse.calendar.application;

import io.apocalypse.calendar.api.CancelProjectionBatchCommand;
import io.apocalypse.calendar.api.ProjectionBatchCommand;
import io.apocalypse.calendar.api.ProjectionBatchResult;

/** 内部投影命令处理端口；LIL-21 的持久化实现挂在 facade guard 之后。 */
public interface ProjectionCommandHandler {

  ProjectionBatchResult upsert(ProjectionBatchCommand command);

  ProjectionBatchResult cancel(CancelProjectionBatchCommand command);
}
