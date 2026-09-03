package io.apocalypse.calendar.infrastructure.persistence;

import java.util.List;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;

public interface BaselineCorrectionMapper extends BaseMapper<BaselineCorrectionDo> {

  default List<BaselineCorrectionDo> selectByReleaseId(Long releaseId) {
    return selectList(
        new LambdaQueryWrapper<BaselineCorrectionDo>()
            .eq(BaselineCorrectionDo::getReleaseId, releaseId)
            .orderByAsc(BaselineCorrectionDo::getLocalDate)
            .orderByAsc(BaselineCorrectionDo::getFieldKey));
  }

  @Insert(
      """
      INSERT INTO cal_baseline_correction
        (id, release_id, local_date, field_key, action, value_json, source_uri,
         source_import_id, reason, create_time, update_time, create_by, update_by, version, deleted)
      VALUES
        (#{value.id}, #{value.releaseId}, #{value.localDate}, #{value.fieldKey}, #{value.action},
         CAST(#{valueJson} AS jsonb), #{value.sourceUri}, #{value.sourceImportId}, #{value.reason},
         now(), now(), #{actor}, #{actor}, 0, 0)
      """)
  int insertJson(
      @Param("value") BaselineCorrectionDo value,
      @Param("valueJson") String valueJson,
      @Param("actor") String actor);
}
