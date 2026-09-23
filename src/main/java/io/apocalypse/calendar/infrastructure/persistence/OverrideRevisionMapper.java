package io.apocalypse.calendar.infrastructure.persistence;

import io.apocalypse.calendar.domain.OverrideScope;
import io.apocalypse.common.response.PageResult;

import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;

public interface OverrideRevisionMapper extends BaseMapper<OverrideRevisionDo> {

  default PageResult<OverrideRevisionDo> selectManagedPage(Long calendarId, int page, int size) {
    return PageResult.of(
        selectPage(
            new Page<>(page, size),
            new LambdaQueryWrapper<OverrideRevisionDo>()
                .eq(OverrideRevisionDo::getCalendarId, calendarId)
                .eq(OverrideRevisionDo::getScopeType, OverrideScope.MANAGED.name())
                .orderByDesc(OverrideRevisionDo::getRevisionNo)));
  }

  default OverrideRevisionDo selectPublished(
      Long calendarId, OverrideScope scope, Long ownerUserId) {
    LambdaQueryWrapper<OverrideRevisionDo> query =
        new LambdaQueryWrapper<OverrideRevisionDo>()
            .eq(OverrideRevisionDo::getCalendarId, calendarId)
            .eq(OverrideRevisionDo::getScopeType, scope.name())
            .eq(OverrideRevisionDo::getState, "PUBLISHED");
    if (ownerUserId == null) {
      query.isNull(OverrideRevisionDo::getOwnerUserId);
    } else {
      query.eq(OverrideRevisionDo::getOwnerUserId, ownerUserId);
    }
    return selectOne(query);
  }

  @Select(
      """
      SELECT * FROM cal_override_revision
      WHERE calendar_id = #{calendarId}
        AND scope_type = 'PERSONAL'
        AND owner_user_id = #{ownerUserId}
        AND state = 'PUBLISHED'
        AND deleted = 0
      FOR UPDATE
      """)
  OverrideRevisionDo selectPublishedPersonalForUpdate(
      @Param("calendarId") Long calendarId, @Param("ownerUserId") Long ownerUserId);

  @Select(
      """
      SELECT * FROM cal_override_revision
      WHERE calendar_id = #{calendarId}
        AND scope_type = 'MANAGED'
        AND owner_user_id IS NULL
        AND state = 'DRAFT'
        AND deleted = 0
      """)
  OverrideRevisionDo selectDraftManaged(@Param("calendarId") Long calendarId);

  @Select(
      """
      SELECT * FROM cal_override_revision
      WHERE calendar_id = #{calendarId}
        AND scope_type = 'MANAGED'
        AND owner_user_id IS NULL
        AND state = 'DRAFT'
        AND deleted = 0
      FOR UPDATE
      """)
  OverrideRevisionDo selectDraftManagedForUpdate(@Param("calendarId") Long calendarId);

  @Select(
      """
      SELECT * FROM cal_override_revision
      WHERE calendar_id = #{calendarId}
        AND scope_type = 'MANAGED'
        AND owner_user_id IS NULL
        AND state = 'PUBLISHED'
        AND deleted = 0
      FOR UPDATE
      """)
  OverrideRevisionDo selectPublishedManagedForUpdate(@Param("calendarId") Long calendarId);

  @Select(
      "SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext('calendar-managed-override:' || #{calendarId}))) locked")
  Integer lockManagedScope(@Param("calendarId") Long calendarId);

  @Select(
      "SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext('calendar-personal-override:' || #{calendarId} || ':' || #{ownerUserId}))) locked")
  Integer lockPersonalScope(
      @Param("calendarId") Long calendarId, @Param("ownerUserId") Long ownerUserId);

  @Select(
      """
      SELECT COALESCE(MAX(revision_no), 0) FROM cal_override_revision
      WHERE calendar_id = #{calendarId} AND scope_type = 'MANAGED' AND owner_user_id IS NULL
      """)
  int selectMaxManagedRevisionNo(@Param("calendarId") Long calendarId);

  @Select(
      """
      SELECT COALESCE(MAX(version), -1) FROM cal_override_revision
      WHERE calendar_id = #{calendarId} AND scope_type = 'MANAGED' AND owner_user_id IS NULL
      """)
  int selectMaxManagedVersion(@Param("calendarId") Long calendarId);

  @Update(
      """
      UPDATE cal_override_revision
      SET state = 'SUPERSEDED', update_time = now(), update_by = #{actor}, version = version + 1
      WHERE id = #{id} AND state = 'PUBLISHED' AND deleted = 0
      """)
  int supersedePublished(@Param("id") Long id, @Param("actor") String actor);

  @Update(
      """
      UPDATE cal_override_revision
      SET baseline_release_id = #{baselineReleaseId}, source_import_id = #{sourceImportId},
          content_hash = #{contentHash},
          update_time = now(), update_by = #{actor}, version = version + 1
      WHERE id = #{id} AND state = 'DRAFT' AND version = #{expectedVersion} AND deleted = 0
      """)
  int updateManagedDraft(
      @Param("id") Long id,
      @Param("baselineReleaseId") Long baselineReleaseId,
      @Param("sourceImportId") Long sourceImportId,
      @Param("contentHash") String contentHash,
      @Param("actor") String actor,
      @Param("expectedVersion") int expectedVersion);

  @Update(
      """
      UPDATE cal_override_revision
      SET deleted = 1, update_time = now(), update_by = #{actor}, version = version + 1
      WHERE id = #{id} AND state = 'DRAFT' AND deleted = 0
      """)
  int deleteManagedDraft(@Param("id") Long id, @Param("actor") String actor);

  @Update(
      """
      UPDATE cal_override_revision
      SET state = 'PUBLISHED', published_at = now(), published_by = #{actor},
          update_time = now(), update_by = #{actor}, version = version + 1
      WHERE id = #{id} AND state = 'DRAFT' AND version = #{expectedVersion} AND deleted = 0
      """)
  int publishManagedDraft(
      @Param("id") Long id,
      @Param("expectedVersion") int expectedVersion,
      @Param("actor") String actor);

  @Update(
      """
      UPDATE cal_override_revision
      SET state = 'WITHDRAWN', withdrawn_at = now(), withdrawn_by = #{actor},
          update_time = now(), update_by = #{actor}, version = version + 1
      WHERE id = #{id} AND state = 'PUBLISHED' AND deleted = 0
      """)
  int withdrawPublishedManaged(@Param("id") Long id, @Param("actor") String actor);
}
