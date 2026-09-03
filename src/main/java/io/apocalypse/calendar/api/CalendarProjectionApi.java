package io.apocalypse.calendar.api;

/** 上游业务模块投影具体事件的唯一公开入口；不暴露个人内容或 Calendar 持久层。 */
public interface CalendarProjectionApi {

  ProjectionBatchResult upsert(ProjectionBatchCommand command);

  ProjectionBatchResult cancel(CancelProjectionBatchCommand command);
}
