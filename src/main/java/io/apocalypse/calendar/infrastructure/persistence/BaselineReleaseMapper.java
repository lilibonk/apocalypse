package io.apocalypse.calendar.infrastructure.persistence;

import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;

public interface BaselineReleaseMapper extends BaseMapper<BaselineReleaseDo> {

  @Select(
      "SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext('calendar-baseline:' || #{regionCode}))) locked")
  Integer lockPublicationScope(@Param("regionCode") String regionCode);

  default BaselineReleaseDo selectPublished(String regionCode) {
    return selectOne(
        new LambdaQueryWrapper<BaselineReleaseDo>()
            .eq(BaselineReleaseDo::getRegionCode, regionCode)
            .eq(BaselineReleaseDo::getState, "PUBLISHED"));
  }

  @Select(
      """
      SELECT * FROM cal_baseline_release
      WHERE id = #{id} AND state = 'PUBLISHED' AND deleted = 0
      FOR UPDATE
      """)
  BaselineReleaseDo selectPublishedByIdForUpdate(@Param("id") Long id);

  @Update(
      """
      UPDATE cal_baseline_release
      SET state = 'SUPERSEDED', update_time = now(), update_by = #{actor}, version = version + 1
      WHERE id = #{id} AND state = 'PUBLISHED' AND deleted = 0
      """)
  int supersede(@Param("id") Long id, @Param("actor") String actor);
}
