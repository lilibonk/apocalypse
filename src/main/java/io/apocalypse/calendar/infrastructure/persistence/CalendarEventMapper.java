package io.apocalypse.calendar.infrastructure.persistence;

import io.apocalypse.common.response.PageResult;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;

public interface CalendarEventMapper extends BaseMapper<CalendarEventDo> {

  default PageResult<CalendarEventDo> selectManagedPage(Long calendarId, int page, int size) {
    return PageResult.of(
        selectPage(
            new Page<>(page, size),
            new LambdaQueryWrapper<CalendarEventDo>()
                .eq(CalendarEventDo::getCalendarId, calendarId)
                .eq(CalendarEventDo::getEventKind, "MANAGED")
                .orderByDesc(CalendarEventDo::getId)));
  }

  @Select(
      """
      SELECT * FROM cal_event
      WHERE id = #{eventId} AND deleted = 0
      FOR UPDATE
      """)
  CalendarEventDo selectForUpdate(@Param("eventId") Long eventId);

  @Update(
      """
      UPDATE cal_event
      SET calendar_id = #{calendarId}, update_time = now(), update_by = #{actor},
          version = version + 1
      WHERE id = #{eventId} AND event_kind = 'PRIVATE' AND owner_user_id = #{ownerUserId}
        AND version = #{expectedVersion} AND state = 'ACTIVE' AND deleted = 0
      """)
  int updatePrivate(
      @Param("eventId") Long eventId,
      @Param("calendarId") Long calendarId,
      @Param("ownerUserId") Long ownerUserId,
      @Param("expectedVersion") int expectedVersion,
      @Param("actor") String actor);

  @Update(
      """
      UPDATE cal_event
      SET state = 'CANCELLED', deleted = 1, update_time = now(), update_by = #{actor},
          version = version + 1
      WHERE id = #{eventId} AND event_kind = 'PRIVATE' AND owner_user_id = #{ownerUserId}
        AND state = 'ACTIVE' AND deleted = 0
      """)
  int cancelPrivate(
      @Param("eventId") Long eventId,
      @Param("ownerUserId") Long ownerUserId,
      @Param("actor") String actor);

  @Update(
      """
      UPDATE cal_event
      SET state = #{state}, update_time = now(), update_by = #{actor}, version = version + 1
      WHERE id = #{eventId} AND calendar_id = #{calendarId} AND event_kind = 'MANAGED'
        AND deleted = 0
      """)
  int updateManagedState(
      @Param("eventId") Long eventId,
      @Param("calendarId") Long calendarId,
      @Param("state") String state,
      @Param("actor") String actor);

  @Update(
      """
      UPDATE cal_event
      SET state = 'CANCELLED', deleted = 1, update_time = now(), update_by = #{actor},
          version = version + 1
      WHERE id = #{eventId} AND calendar_id = #{calendarId} AND event_kind = 'MANAGED'
        AND deleted = 0
        AND NOT EXISTS (
          SELECT 1 FROM cal_event_revision
          WHERE event_id = #{eventId} AND deleted = 0
        )
      """)
  int deleteEmptyManaged(
      @Param("eventId") Long eventId,
      @Param("calendarId") Long calendarId,
      @Param("actor") String actor);

  @Select(
      """
      <script>
      SELECT e.id
      FROM cal_event e
      JOIN cal_event_revision r ON r.event_id = e.id
      WHERE e.deleted = 0 AND e.state = 'ACTIVE'
        AND r.deleted = 0 AND r.state = 'PUBLISHED'
        AND (
          (e.event_kind = 'PRIVATE' AND e.owner_user_id = #{ownerUserId}
            AND e.calendar_id = #{calendarId})
          OR
          (e.event_kind = 'MANAGED' AND e.calendar_id IN
            <foreach collection="managedCalendarIds" item="id" open="(" separator="," close=")">
              #{id}
            </foreach>)
        )
        AND (
          (r.time_kind = 'ALL_DAY' AND r.start_date &lt; #{toExclusive}
            AND r.end_date_exclusive &gt; #{from})
          OR
          (r.time_kind = 'TIMED' AND r.start_at_utc &lt; #{toUtc}
            AND r.end_at_utc &gt; #{fromUtc})
        )
      ORDER BY COALESCE(r.start_date::timestamp, r.start_at_utc), e.id
      LIMIT #{size} OFFSET #{offset}
      </script>
      """)
  List<Long> selectVisibleIds(
      @Param("calendarId") Long calendarId,
      @Param("managedCalendarIds") List<Long> managedCalendarIds,
      @Param("ownerUserId") Long ownerUserId,
      @Param("from") LocalDate from,
      @Param("toExclusive") LocalDate toExclusive,
      @Param("fromUtc") LocalDateTime fromUtc,
      @Param("toUtc") LocalDateTime toUtc,
      @Param("size") int size,
      @Param("offset") long offset);

  @Select(
      """
      <script>
      SELECT count(*)
      FROM cal_event e
      JOIN cal_event_revision r ON r.event_id = e.id
      WHERE e.deleted = 0 AND e.state = 'ACTIVE'
        AND r.deleted = 0 AND r.state = 'PUBLISHED'
        AND (
          (e.event_kind = 'PRIVATE' AND e.owner_user_id = #{ownerUserId}
            AND e.calendar_id = #{calendarId})
          OR
          (e.event_kind = 'MANAGED' AND e.calendar_id IN
            <foreach collection="managedCalendarIds" item="id" open="(" separator="," close=")">
              #{id}
            </foreach>)
        )
        AND (
          (r.time_kind = 'ALL_DAY' AND r.start_date &lt; #{toExclusive}
            AND r.end_date_exclusive &gt; #{from})
          OR
          (r.time_kind = 'TIMED' AND r.start_at_utc &lt; #{toUtc}
            AND r.end_at_utc &gt; #{fromUtc})
        )
      </script>
      """)
  long countVisible(
      @Param("calendarId") Long calendarId,
      @Param("managedCalendarIds") List<Long> managedCalendarIds,
      @Param("ownerUserId") Long ownerUserId,
      @Param("from") LocalDate from,
      @Param("toExclusive") LocalDate toExclusive,
      @Param("fromUtc") LocalDateTime fromUtc,
      @Param("toUtc") LocalDateTime toUtc);
}
