package io.apocalypse.calendar.infrastructure.persistence;

import java.util.List;

import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;

public interface CalendarMapper extends BaseMapper<CalendarDo> {

  default CalendarDo selectByKey(String calendarKey) {
    return selectOne(
        new LambdaQueryWrapper<CalendarDo>().eq(CalendarDo::getCalendarKey, calendarKey));
  }

  default CalendarDo selectSystemByRegion(String regionCode) {
    return selectOne(
        new LambdaQueryWrapper<CalendarDo>()
            .eq(CalendarDo::getKind, "SYSTEM")
            .eq(CalendarDo::getRegionCode, regionCode));
  }

  @Select(
      """
      SELECT DISTINCT c.*
      FROM cal_calendar c
      LEFT JOIN cal_calendar_member m
        ON m.calendar_id = c.id
       AND m.user_id = #{userId}
       AND m.state = 'ACTIVE'
       AND m.deleted = 0
      WHERE c.deleted = 0
        AND c.state <> 'ARCHIVED'
        AND (c.kind = 'SYSTEM' OR m.id IS NOT NULL)
      ORDER BY c.kind DESC, c.name, c.id
      """)
  List<CalendarDo> selectVisibleByUserId(@Param("userId") Long userId);

  @Select(
      "SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext('calendar-hierarchy:' || #{regionCode}))) locked")
  Integer lockHierarchy(@Param("regionCode") String regionCode);

  @Select(
      """
      WITH RECURSIVE subtree AS (
        SELECT id, 0 AS depth, ARRAY[id] AS path
        FROM cal_calendar WHERE id = #{calendarId} AND deleted = 0
        UNION ALL
        SELECT child.id, parent.depth + 1, parent.path || child.id
        FROM cal_calendar child JOIN subtree parent ON child.parent_id = parent.id
        WHERE child.deleted = 0 AND parent.depth < 8 AND NOT child.id = ANY(parent.path)
      )
      SELECT COALESCE(MAX(depth), 0) FROM subtree
      """)
  int selectDescendantDepth(@Param("calendarId") Long calendarId);
}
