package io.apocalypse.calendar.infrastructure.persistence;

import java.util.List;

import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;

public interface CalendarMemberMapper extends BaseMapper<CalendarMemberDo> {

  default CalendarMemberDo selectActive(Long calendarId, Long userId) {
    return selectOne(
        new LambdaQueryWrapper<CalendarMemberDo>()
            .eq(CalendarMemberDo::getCalendarId, calendarId)
            .eq(CalendarMemberDo::getUserId, userId)
            .eq(CalendarMemberDo::getState, "ACTIVE"));
  }

  @Select(
      """
      SELECT * FROM cal_calendar_member
      WHERE calendar_id = #{calendarId} AND state = 'ACTIVE' AND deleted = 0
      ORDER BY role DESC, user_id
      """)
  List<CalendarMemberDo> selectActiveByCalendarId(@Param("calendarId") Long calendarId);

  default Page<CalendarMemberDo> selectActivePage(Long calendarId, int page, int size) {
    return selectPage(
        Page.of(page, size),
        new LambdaQueryWrapper<CalendarMemberDo>()
            .eq(CalendarMemberDo::getCalendarId, calendarId)
            .eq(CalendarMemberDo::getState, "ACTIVE")
            .orderByAsc(CalendarMemberDo::getUserId));
  }

  @Select(
      """
      SELECT * FROM cal_calendar_member
      WHERE calendar_id = #{calendarId} AND state = 'ACTIVE' AND deleted = 0
      ORDER BY id
      FOR UPDATE
      """)
  List<CalendarMemberDo> selectActiveForUpdate(@Param("calendarId") Long calendarId);

  @Update(
      """
      UPDATE cal_calendar_member
      SET deleted = 1, update_time = now(), version = version + 1
      WHERE id = #{id} AND version = #{version} AND deleted = 0
      """)
  int deleteWithVersion(@Param("id") Long id, @Param("version") int version);
}
