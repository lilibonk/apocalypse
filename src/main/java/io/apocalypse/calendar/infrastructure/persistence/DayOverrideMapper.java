package io.apocalypse.calendar.infrastructure.persistence;

import java.time.LocalDate;
import java.util.List;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;

public interface DayOverrideMapper extends BaseMapper<DayOverrideDo> {

  @Insert(
      """
      INSERT INTO cal_day_override
        (id, revision_id, local_date, field_key, action, value_json,
         underlay_value_json, underlay_value_hash, underlay_source_type,
         underlay_source_key, underlay_source_version,
         create_time, create_by, update_time, update_by, version, deleted)
      VALUES
        (#{value.id}, #{value.revisionId}, #{value.localDate}, #{value.fieldKey}, #{value.action},
         CAST(#{value.valueJson} AS jsonb), CAST(#{value.underlayValueJson} AS jsonb),
         #{value.underlayValueHash}, #{value.underlaySourceType},
         #{value.underlaySourceKey}, #{value.underlaySourceVersion},
         now(), #{actor}, now(), #{actor}, 0, 0)
      """)
  int insertJson(@Param("value") DayOverrideDo value, @Param("actor") String actor);

  @Select(
      """
      SELECT id, revision_id, local_date, field_key, action,
             value_json::text AS value_json,
             underlay_value_json::text AS underlay_value_json,
             underlay_value_hash, underlay_source_type,
             underlay_source_key, underlay_source_version,
             create_time, create_by, update_time, update_by, version, deleted, remark
      FROM cal_day_override
      WHERE revision_id = #{revisionId} AND deleted = 0
      ORDER BY local_date, field_key, id
      """)
  List<DayOverrideDo> selectByRevisionId(@Param("revisionId") Long revisionId);

  @Select(
      """
      SELECT id, revision_id, local_date, field_key, action,
             value_json::text AS value_json,
             underlay_value_json::text AS underlay_value_json,
             underlay_value_hash, underlay_source_type,
             underlay_source_key, underlay_source_version,
             create_time, create_by, update_time, update_by, version, deleted, remark
      FROM cal_day_override
      WHERE revision_id = #{revisionId} AND deleted = 0
        AND local_date BETWEEN #{from} AND #{to}
      ORDER BY local_date, field_key, id
      """)
  List<DayOverrideDo> selectByRevisionIdAndDateRange(
      @Param("revisionId") Long revisionId,
      @Param("from") LocalDate from,
      @Param("to") LocalDate to);

  @Update(
      """
      UPDATE cal_day_override
      SET deleted = 1, update_time = now(), update_by = #{actor}, version = version + 1
      WHERE revision_id = #{revisionId} AND deleted = 0
      """)
  int deleteByRevisionId(@Param("revisionId") Long revisionId, @Param("actor") String actor);
}
