package io.apocalypse.calendar.infrastructure.persistence;

import io.apocalypse.common.response.PageResult;

import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;

public interface DataImportMapper extends BaseMapper<DataImportDo> {

  @Select(
      "SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext('calendar-data-import-storage'))) locked")
  Integer lockStorageQuota();

  @Select(
      """
      SELECT
        COALESCE(SUM(data_file_size + COALESCE(evidence_file_size, 0)
          + #{recordOverheadBytes}), 0) AS total_charge_bytes,
        COALESCE(SUM(data_file_size + COALESCE(evidence_file_size, 0)
          + #{recordOverheadBytes})
          FILTER (WHERE uploader_user_id = #{uploaderUserId}), 0) AS uploader_charge_bytes,
        COALESCE(SUM(data_file_size + COALESCE(evidence_file_size, 0)
          + #{recordOverheadBytes})
          FILTER (WHERE target_type = #{targetType}
            AND ((#{targetType} = 'SYSTEM_BASELINE' AND region_code = #{regionCode})
              OR (#{targetType} = 'MANAGED_OVERRIDE'
                AND target_calendar_id = #{targetCalendarId}))), 0) AS target_charge_bytes
      FROM cal_data_import
      """)
  DataImportStorageUsageDo selectStorageUsage(
      @Param("uploaderUserId") Long uploaderUserId,
      @Param("targetType") String targetType,
      @Param("targetCalendarId") Long targetCalendarId,
      @Param("regionCode") String regionCode,
      @Param("recordOverheadBytes") long recordOverheadBytes);

  @Select(
      """
      SELECT DISTINCT
        i.id, i.import_key, i.uploader_user_id, i.target_type, i.target_calendar_id,
        i.region_code, i.data_year,
        i.source_claim, i.assurance_level, i.document_no, i.document_title, i.issuer,
        i.document_published_on, i.source_uri,
        i.data_file_name, i.data_content_type, i.data_file_size, i.data_file_sha256,
        NULL::bytea AS data_file_bytes,
        i.evidence_file_name, i.evidence_content_type, i.evidence_file_size,
        i.evidence_file_sha256, NULL::bytea AS evidence_file_bytes,
        i.normalized_payload, i.normalized_payload_hash, i.validation_report, i.diff_report,
        i.state, i.reviewed_at, i.reviewed_by, i.review_note,
        i.published_at, i.published_by, i.published_release_id, i.published_revision_id,
        i.remark, i.create_time, i.update_time, i.create_by, i.update_by, i.version, i.deleted
      FROM cal_data_import i
      LEFT JOIN cal_calendar_member m
        ON m.calendar_id = i.target_calendar_id
       AND m.user_id = #{userId}
       AND m.state = 'ACTIVE'
       AND m.role IN ('EDITOR', 'PUBLISHER')
       AND m.deleted = 0
      WHERE i.deleted = 0
        AND (i.target_type = 'SYSTEM_BASELINE' OR m.id IS NOT NULL)
      ORDER BY i.create_time DESC, i.id DESC
      """)
  Page<DataImportDo> selectVisiblePage(Page<DataImportDo> page, @Param("userId") Long userId);

  default PageResult<DataImportDo> pageVisible(Long userId, int page, int size) {
    return PageResult.of(selectVisiblePage(new Page<>(page, size), userId));
  }

  @Select("SELECT * FROM cal_data_import WHERE id = #{id} AND deleted = 0 FOR UPDATE")
  DataImportDo selectByIdForUpdate(@Param("id") Long id);

  @Update(
      """
      UPDATE cal_data_import
      SET normalized_payload = CAST(#{payload} AS jsonb),
          normalized_payload_hash = #{payloadHash},
          validation_report = CAST(#{validationReport} AS jsonb),
          diff_report = CAST(#{diffReport} AS jsonb),
          state = #{state}, update_time = now(), update_by = #{actor}, version = version + 1
      WHERE id = #{id} AND version = #{expectedVersion} AND state = 'UPLOADED' AND deleted = 0
      """)
  int updateValidation(
      @Param("id") Long id,
      @Param("expectedVersion") int expectedVersion,
      @Param("payload") String payload,
      @Param("payloadHash") String payloadHash,
      @Param("validationReport") String validationReport,
      @Param("diffReport") String diffReport,
      @Param("state") String state,
      @Param("actor") String actor);

  @Update(
      """
      UPDATE cal_data_import
      SET diff_report = CAST(#{diffReport} AS jsonb), state = 'REVIEWED',
          reviewed_at = now(), reviewed_by = #{actor}, review_note = #{reviewNote},
          update_time = now(), update_by = #{actor}, version = version + 1
      WHERE id = #{id} AND version = #{expectedVersion} AND state = 'VALIDATED' AND deleted = 0
      """)
  int review(
      @Param("id") Long id,
      @Param("expectedVersion") int expectedVersion,
      @Param("diffReport") String diffReport,
      @Param("reviewNote") String reviewNote,
      @Param("actor") String actor);

  @Update(
      """
      UPDATE cal_data_import
      SET state = 'REJECTED', review_note = #{reviewNote},
          update_time = now(), update_by = #{actor}, version = version + 1
      WHERE id = #{id} AND version = #{expectedVersion}
        AND state IN ('UPLOADED', 'VALIDATED', 'INVALID', 'REVIEWED') AND deleted = 0
      """)
  int reject(
      @Param("id") Long id,
      @Param("expectedVersion") int expectedVersion,
      @Param("reviewNote") String reviewNote,
      @Param("actor") String actor);

  @Update(
      """
      UPDATE cal_data_import
      SET state = 'PUBLISHED', published_at = now(), published_by = #{actor},
          published_release_id = #{releaseId}, published_revision_id = #{revisionId},
          update_time = now(), update_by = #{actor}, version = version + 1
      WHERE id = #{id} AND version = #{expectedVersion} AND state = 'REVIEWED' AND deleted = 0
      """)
  int markPublished(
      @Param("id") Long id,
      @Param("expectedVersion") int expectedVersion,
      @Param("releaseId") Long releaseId,
      @Param("revisionId") Long revisionId,
      @Param("actor") String actor);
}
