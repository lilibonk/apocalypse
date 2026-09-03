package io.apocalypse.calendar.infrastructure.persistence;

import java.util.List;

import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;

public interface ProjectionGrantMapper extends BaseMapper<ProjectionGrantDo> {

  default List<ProjectionGrantDo> selectByCalendar(Long calendarId) {
    return selectList(
        new LambdaQueryWrapper<ProjectionGrantDo>()
            .eq(ProjectionGrantDo::getCalendarId, calendarId)
            .orderByAsc(ProjectionGrantDo::getSourceSystem));
  }

  default ProjectionGrantDo selectActive(Long calendarId, String sourceSystem) {
    return selectOne(
        new LambdaQueryWrapper<ProjectionGrantDo>()
            .eq(ProjectionGrantDo::getCalendarId, calendarId)
            .eq(ProjectionGrantDo::getSourceSystem, sourceSystem)
            .eq(ProjectionGrantDo::getState, "ACTIVE"));
  }

  @Select(
      "SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext('calendar-projection-grant:' || #{calendarId} || ':' || #{sourceSystem}))) locked")
  Integer lockScope(
      @Param("calendarId") Long calendarId, @Param("sourceSystem") String sourceSystem);

  @Select(
      """
      SELECT * FROM cal_projection_grant
      WHERE calendar_id = #{calendarId} AND source_system = #{sourceSystem} AND deleted = 0
      FOR UPDATE
      """)
  ProjectionGrantDo selectForUpdate(
      @Param("calendarId") Long calendarId, @Param("sourceSystem") String sourceSystem);

  @Update(
      """
      UPDATE cal_projection_grant
      SET publish_mode = #{publishMode}, state = 'ACTIVE', update_time = now(),
          update_by = #{actor}, version = version + 1
      WHERE id = #{id} AND version = #{expectedVersion} AND deleted = 0
      """)
  int activate(
      @Param("id") Long id,
      @Param("publishMode") String publishMode,
      @Param("expectedVersion") int expectedVersion,
      @Param("actor") String actor);

  @Update(
      """
      UPDATE cal_projection_grant
      SET state = 'INACTIVE', update_time = now(), update_by = #{actor}, version = version + 1
      WHERE id = #{id} AND state = 'ACTIVE' AND deleted = 0
      """)
  int deactivate(@Param("id") Long id, @Param("actor") String actor);
}
