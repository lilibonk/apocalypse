package io.apocalypse.calendar.infrastructure.persistence;

import io.apocalypse.calendar.domain.ProjectionSourceIdentity;

import java.util.List;

import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;

public interface ProjectionSourceMapper extends BaseMapper<ProjectionSourceDo> {

  /** Lock actual hash keys in numeric order, including collisions, before any per-row lock. */
  @Select(
      """
      <script>
      SELECT 1 FROM (
        SELECT pg_advisory_xact_lock(lock_key) FROM (
          SELECT DISTINCT hashtext('calendar-projection-source:' || #{sourceSystem} || ':' || source_type || ':' || source_key)::bigint AS lock_key
          FROM (VALUES
            <foreach collection="identities" item="identity" separator=",">
              (#{identity.sourceType}, #{identity.sourceKey})
            </foreach>
          ) AS identities(source_type, source_key)
          ORDER BY lock_key
        ) ordered_keys
      ) locked
      </script>
      """)
  List<Integer> lockSources(
      @Param("sourceSystem") String sourceSystem,
      @Param("identities") List<ProjectionSourceIdentity> identities);

  default ProjectionSourceDo selectBySource(
      String sourceSystem, String sourceType, String sourceKey) {
    return selectOne(
        new LambdaQueryWrapper<ProjectionSourceDo>()
            .eq(ProjectionSourceDo::getSourceSystem, sourceSystem)
            .eq(ProjectionSourceDo::getSourceType, sourceType)
            .eq(ProjectionSourceDo::getSourceKey, sourceKey));
  }

  @Select(
      "SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext('calendar-projection-source:' || #{sourceSystem} || ':' || #{sourceType} || ':' || #{sourceKey}))) locked")
  Integer lockSource(
      @Param("sourceSystem") String sourceSystem,
      @Param("sourceType") String sourceType,
      @Param("sourceKey") String sourceKey);

  @Select(
      """
      SELECT * FROM cal_projection_source
      WHERE source_system = #{sourceSystem} AND source_type = #{sourceType}
        AND source_key = #{sourceKey}
      FOR UPDATE
      """)
  ProjectionSourceDo selectForUpdate(
      @Param("sourceSystem") String sourceSystem,
      @Param("sourceType") String sourceType,
      @Param("sourceKey") String sourceKey);

  @Update(
      """
      UPDATE cal_projection_source
      SET source_version = #{sourceVersion}, payload_hash = #{payloadHash}, state = 'ACTIVE',
          update_time = now(), update_by = #{actor}, version = version + 1
      WHERE id = #{id} AND version = #{expectedVersion} AND state = 'ACTIVE'
      """)
  int updateActive(
      @Param("id") Long id,
      @Param("sourceVersion") long sourceVersion,
      @Param("payloadHash") String payloadHash,
      @Param("expectedVersion") int expectedVersion,
      @Param("actor") String actor);

  @Update(
      """
      UPDATE cal_projection_source
      SET source_version = #{sourceVersion}, state = 'CANCELLED',
          update_time = now(), update_by = #{actor}, version = version + 1
      WHERE id = #{id} AND version = #{expectedVersion} AND state = 'ACTIVE'
      """)
  int cancel(
      @Param("id") Long id,
      @Param("sourceVersion") long sourceVersion,
      @Param("expectedVersion") int expectedVersion,
      @Param("actor") String actor);
}
