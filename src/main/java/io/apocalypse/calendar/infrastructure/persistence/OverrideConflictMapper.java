package io.apocalypse.calendar.infrastructure.persistence;

import java.util.List;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;

public interface OverrideConflictMapper extends BaseMapper<OverrideConflictDo> {

  /** Carry an unchanged personal item's latest KEEP decision into an immutable replacement. */
  @Insert(
      """
      INSERT INTO cal_override_conflict
        (id, override_item_id, trigger_type, trigger_key,
         previous_underlay_json, current_underlay_json, previous_hash, current_hash,
         state, detected_at, resolved_at, resolved_by, resolution_revision_id,
         create_time, create_by, update_time, update_by, version, deleted)
      SELECT #{id}, n.id, c.trigger_type, c.trigger_key,
             c.previous_underlay_json, c.current_underlay_json, c.previous_hash, c.current_hash,
             'KEPT', c.detected_at, c.resolved_at, c.resolved_by, c.resolution_revision_id,
             now(), #{actor}, now(), #{actor}, 0, 0
      FROM cal_override_conflict c
      JOIN cal_day_override o ON o.id = c.override_item_id AND o.deleted = 0
      JOIN cal_day_override n ON n.id = #{newItemId} AND n.deleted = 0
      JOIN cal_override_revision r ON r.id = o.revision_id AND r.deleted = 0
      JOIN cal_override_revision nr ON nr.id = n.revision_id AND nr.deleted = 0
      WHERE c.id = (
        SELECT latest.id FROM cal_override_conflict latest
        WHERE latest.override_item_id = #{oldItemId} AND latest.deleted = 0
          AND latest.state IN ('OPEN', 'KEPT')
        ORDER BY latest.detected_at DESC, latest.id DESC LIMIT 1
      ) AND c.state = 'KEPT' AND c.deleted = 0
        AND r.scope_type = 'PERSONAL' AND nr.scope_type = 'PERSONAL'
        AND r.calendar_id = nr.calendar_id AND r.owner_user_id = nr.owner_user_id
        AND nr.state = 'PUBLISHED'
        AND o.local_date = n.local_date AND o.field_key = n.field_key
        AND o.action = n.action AND o.value_json IS NOT DISTINCT FROM n.value_json
        AND o.underlay_value_hash = n.underlay_value_hash
        AND o.underlay_value_json = n.underlay_value_json
      """)
  int copyLatestKept(
      @Param("id") Long id,
      @Param("oldItemId") Long oldItemId,
      @Param("newItemId") Long newItemId,
      @Param("actor") String actor);

  @Select(
      """
      SELECT c.id, c.override_item_id, c.trigger_type, c.trigger_key,
             c.previous_underlay_json::text AS previous_underlay_json,
             c.current_underlay_json::text AS current_underlay_json,
             c.previous_hash, c.current_hash, c.state, c.detected_at,
             c.resolved_at, c.resolved_by, c.resolution_revision_id,
             c.create_time, c.create_by, c.update_time, c.update_by,
             c.version, c.deleted, c.remark
      FROM cal_override_conflict c
      WHERE c.override_item_id = #{overrideItemId} AND c.deleted = 0
        AND c.state IN ('OPEN', 'KEPT')
      ORDER BY c.detected_at DESC, c.id DESC
      LIMIT 1
      """)
  OverrideConflictDo selectLatestForItem(@Param("overrideItemId") Long overrideItemId);

  @Select(
      """
      <script>
      SELECT DISTINCT ON (c.override_item_id)
             c.id, c.override_item_id, c.trigger_type, c.trigger_key,
             c.previous_underlay_json::text AS previous_underlay_json,
             c.current_underlay_json::text AS current_underlay_json,
             c.previous_hash, c.current_hash, c.state, c.detected_at,
             c.resolved_at, c.resolved_by, c.resolution_revision_id,
             c.create_time, c.create_by, c.update_time, c.update_by,
             c.version, c.deleted, c.remark
      FROM cal_override_conflict c
      WHERE c.deleted = 0 AND c.state IN ('OPEN', 'KEPT')
        AND c.override_item_id IN
        <foreach collection="overrideItemIds" item="id" open="(" separator="," close=")">
          #{id}
        </foreach>
      ORDER BY c.override_item_id, c.detected_at DESC, c.id DESC
      </script>
      """)
  List<OverrideConflictDo> selectLatestForItems(
      @Param("overrideItemIds") List<Long> overrideItemIds);

  @Insert(
      """
      INSERT INTO cal_override_conflict
        (id, override_item_id, trigger_type, trigger_key,
         previous_underlay_json, current_underlay_json, previous_hash, current_hash,
         state, detected_at, create_time, create_by, update_time, update_by, version, deleted)
      VALUES
        (#{value.id}, #{value.overrideItemId}, #{value.triggerType}, #{value.triggerKey},
         CAST(#{value.previousUnderlayJson} AS jsonb),
         CAST(#{value.currentUnderlayJson} AS jsonb),
         #{value.previousHash}, #{value.currentHash}, 'OPEN', now(),
         now(), #{actor}, now(), #{actor}, 0, 0)
      ON CONFLICT DO NOTHING
      """)
  int insertJson(@Param("value") OverrideConflictDo value, @Param("actor") String actor);

  @Select(
      """
      <script>
      SELECT c.id, c.override_item_id, c.trigger_type, c.trigger_key,
             c.previous_underlay_json::text AS previous_underlay_json,
             c.current_underlay_json::text AS current_underlay_json,
             c.previous_hash, c.current_hash, c.state, c.detected_at,
             c.resolved_at, c.resolved_by, c.resolution_revision_id,
             c.create_time, c.create_by, c.update_time, c.update_by,
             c.version, c.deleted, c.remark,
             o.revision_id, o.local_date, o.field_key,
             r.calendar_id, r.scope_type, r.owner_user_id
      FROM cal_override_conflict c
      JOIN cal_day_override o ON o.id = c.override_item_id AND o.deleted = 0
      JOIN cal_override_revision r ON r.id = o.revision_id AND r.deleted = 0
      WHERE r.calendar_id = #{calendarId} AND r.scope_type = #{scopeType}
        AND r.state = 'PUBLISHED' AND c.deleted = 0
        <choose>
          <when test="ownerUserId != null">AND r.owner_user_id = #{ownerUserId}</when>
          <otherwise>AND r.owner_user_id IS NULL</otherwise>
        </choose>
      ORDER BY c.detected_at DESC, c.id DESC
      LIMIT #{size} OFFSET #{offset}
      </script>
      """)
  List<OverrideConflictDo> selectCurrentPage(
      @Param("calendarId") Long calendarId,
      @Param("scopeType") String scopeType,
      @Param("ownerUserId") Long ownerUserId,
      @Param("size") int size,
      @Param("offset") long offset);

  @Select(
      """
      <script>
      SELECT count(*)
      FROM cal_override_conflict c
      JOIN cal_day_override o ON o.id = c.override_item_id AND o.deleted = 0
      JOIN cal_override_revision r ON r.id = o.revision_id AND r.deleted = 0
      WHERE r.calendar_id = #{calendarId} AND r.scope_type = #{scopeType}
        AND r.state = 'PUBLISHED' AND c.deleted = 0
        <choose>
          <when test="ownerUserId != null">AND r.owner_user_id = #{ownerUserId}</when>
          <otherwise>AND r.owner_user_id IS NULL</otherwise>
        </choose>
      </script>
      """)
  long countCurrent(
      @Param("calendarId") Long calendarId,
      @Param("scopeType") String scopeType,
      @Param("ownerUserId") Long ownerUserId);

  @Select(
      """
      <script>
      SELECT c.id, c.override_item_id, c.trigger_type, c.trigger_key,
             c.previous_underlay_json::text AS previous_underlay_json,
             c.current_underlay_json::text AS current_underlay_json,
             c.previous_hash, c.current_hash, c.state, c.detected_at,
             c.resolved_at, c.resolved_by, c.resolution_revision_id,
             c.create_time, c.create_by, c.update_time, c.update_by,
             c.version, c.deleted, c.remark,
             o.revision_id, o.local_date, o.field_key,
             r.calendar_id, r.scope_type, r.owner_user_id
      FROM cal_override_conflict c
      JOIN cal_day_override o ON o.id = c.override_item_id AND o.deleted = 0
      JOIN cal_override_revision r ON r.id = o.revision_id AND r.deleted = 0
      WHERE r.calendar_id = #{calendarId} AND r.scope_type = #{scopeType}
        AND r.state = 'PUBLISHED' AND c.deleted = 0 AND c.state = 'OPEN'
        <choose>
          <when test="ownerUserId != null">AND r.owner_user_id = #{ownerUserId}</when>
          <otherwise>AND r.owner_user_id IS NULL</otherwise>
        </choose>
      ORDER BY c.detected_at, c.id
      </script>
      """)
  List<OverrideConflictDo> selectOpenCurrent(
      @Param("calendarId") Long calendarId,
      @Param("scopeType") String scopeType,
      @Param("ownerUserId") Long ownerUserId);

  @Select(
      """
      <script>
      SELECT c.id, c.override_item_id, c.trigger_type, c.trigger_key,
             c.previous_underlay_json::text AS previous_underlay_json,
             c.current_underlay_json::text AS current_underlay_json,
             c.previous_hash, c.current_hash, c.state, c.detected_at,
             c.resolved_at, c.resolved_by, c.resolution_revision_id,
             c.create_time, c.create_by, c.update_time, c.update_by,
             c.version, c.deleted, c.remark,
             o.revision_id, o.local_date, o.field_key,
             r.calendar_id, r.scope_type, r.owner_user_id
      FROM cal_override_conflict c
      JOIN cal_day_override o ON o.id = c.override_item_id AND o.deleted = 0
      JOIN cal_override_revision r ON r.id = o.revision_id AND r.deleted = 0
      WHERE c.id = #{conflictId} AND r.calendar_id = #{calendarId}
        AND r.scope_type = #{scopeType} AND r.state = 'PUBLISHED'
        AND c.deleted = 0
        <choose>
          <when test="ownerUserId != null">AND r.owner_user_id = #{ownerUserId}</when>
          <otherwise>AND r.owner_user_id IS NULL</otherwise>
        </choose>
      </script>
      """)
  OverrideConflictDo selectCurrentById(
      @Param("conflictId") Long conflictId,
      @Param("calendarId") Long calendarId,
      @Param("scopeType") String scopeType,
      @Param("ownerUserId") Long ownerUserId);

  @Update(
      """
      UPDATE cal_override_conflict
      SET state = #{state}, resolved_at = now(), resolved_by = #{actor},
          resolution_revision_id = #{resolutionRevisionId},
          update_time = now(), update_by = #{actor}, version = version + 1
      WHERE id = #{conflictId} AND state = 'OPEN' AND deleted = 0
      """)
  int resolve(
      @Param("conflictId") Long conflictId,
      @Param("state") String state,
      @Param("resolutionRevisionId") Long resolutionRevisionId,
      @Param("actor") String actor);
}
