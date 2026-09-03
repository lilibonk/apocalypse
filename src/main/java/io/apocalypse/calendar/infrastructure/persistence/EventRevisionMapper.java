package io.apocalypse.calendar.infrastructure.persistence;

import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;

public interface EventRevisionMapper extends BaseMapper<EventRevisionDo> {

  default EventRevisionDo selectPublished(Long eventId) {
    return selectOne(
        new LambdaQueryWrapper<EventRevisionDo>()
            .eq(EventRevisionDo::getEventId, eventId)
            .eq(EventRevisionDo::getState, "PUBLISHED"));
  }

  default EventRevisionDo selectDraft(Long eventId) {
    return selectOne(
        new LambdaQueryWrapper<EventRevisionDo>()
            .eq(EventRevisionDo::getEventId, eventId)
            .eq(EventRevisionDo::getState, "DRAFT"));
  }

  default EventRevisionDo selectLatest(Long eventId) {
    return selectOne(
        new LambdaQueryWrapper<EventRevisionDo>()
            .eq(EventRevisionDo::getEventId, eventId)
            .orderByDesc(EventRevisionDo::getRevisionNo)
            .last("LIMIT 1"));
  }

  default java.util.List<EventRevisionDo> selectPublishedByEventIds(java.util.List<Long> eventIds) {
    return selectList(
        new LambdaQueryWrapper<EventRevisionDo>()
            .in(EventRevisionDo::getEventId, eventIds)
            .eq(EventRevisionDo::getState, "PUBLISHED"));
  }

  @Select(
      """
      SELECT * FROM cal_event_revision
      WHERE event_id = #{eventId} AND state = 'PUBLISHED' AND deleted = 0
      FOR UPDATE
      """)
  EventRevisionDo selectPublishedForUpdate(@Param("eventId") Long eventId);

  @Select(
      """
      SELECT * FROM cal_event_revision
      WHERE event_id = #{eventId} AND state = 'DRAFT' AND deleted = 0
      FOR UPDATE
      """)
  EventRevisionDo selectDraftForUpdate(@Param("eventId") Long eventId);

  @Select(
      """
      SELECT COALESCE(MAX(revision_no), 0)
      FROM cal_event_revision
      WHERE event_id = #{eventId} AND deleted = 0
      """)
  int selectMaxRevisionNo(@Param("eventId") Long eventId);

  @Update(
      """
      UPDATE cal_event_revision
      SET state = 'SUPERSEDED', closed_at = now(), closed_by = #{actor},
          update_time = now(), update_by = #{actor}, version = version + 1
      WHERE id = #{revisionId} AND state = 'PUBLISHED' AND deleted = 0
      """)
  int supersedePublished(@Param("revisionId") Long revisionId, @Param("actor") String actor);

  @Update(
      """
      UPDATE cal_event_revision
      SET title = #{value.title}, description = #{value.description},
          location = #{value.location}, time_kind = #{value.timeKind},
          start_date = #{value.startDate}, end_date_exclusive = #{value.endDateExclusive},
          start_at_utc = #{value.startAtUtc}, end_at_utc = #{value.endAtUtc},
          zone_id = #{value.zoneId}, content_hash = #{value.contentHash},
          update_time = now(), update_by = #{actor}, version = version + 1
      WHERE id = #{value.id} AND state = 'DRAFT' AND version = #{expectedVersion}
        AND deleted = 0
      """)
  int updateDraft(
      @Param("value") EventRevisionDo value,
      @Param("expectedVersion") int expectedVersion,
      @Param("actor") String actor);

  @Update(
      """
      UPDATE cal_event_revision
      SET deleted = 1, update_time = now(), update_by = #{actor}, version = version + 1
      WHERE id = #{revisionId} AND state = 'DRAFT' AND deleted = 0
      """)
  int deleteDraft(@Param("revisionId") Long revisionId, @Param("actor") String actor);

  @Update(
      """
      UPDATE cal_event_revision
      SET state = 'PUBLISHED', published_at = now(), published_by = #{actor},
          update_time = now(), update_by = #{actor}, version = version + 1
      WHERE id = #{revisionId} AND state = 'DRAFT' AND version = #{expectedVersion}
        AND deleted = 0
      """)
  int publishDraft(
      @Param("revisionId") Long revisionId,
      @Param("expectedVersion") int expectedVersion,
      @Param("actor") String actor);

  @Update(
      """
      UPDATE cal_event_revision
      SET state = 'WITHDRAWN', closed_at = now(), closed_by = #{actor},
          update_time = now(), update_by = #{actor}, version = version + 1
      WHERE id = #{revisionId} AND state = 'PUBLISHED' AND deleted = 0
      """)
  int withdrawPublished(@Param("revisionId") Long revisionId, @Param("actor") String actor);

  @Update(
      """
      UPDATE cal_event_revision
      SET state = 'CANCELLED', closed_at = now(), closed_by = #{actor},
          update_time = now(), update_by = #{actor}, version = version + 1
      WHERE id = #{revisionId} AND state IN ('DRAFT', 'PUBLISHED') AND deleted = 0
      """)
  int cancelRevision(@Param("revisionId") Long revisionId, @Param("actor") String actor);
}
