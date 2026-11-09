package io.apocalypse.system.authorization.mapper;

import io.apocalypse.system.authorization.entity.AuthorizationAuditEntity;

import java.time.LocalDateTime;

import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.IdWorker;

public interface AuthorizationAuditMapper extends BaseMapper<AuthorizationAuditEntity> {
  default int insertIdempotent(AuthorizationAuditEntity entity) {
    if (entity.getId() == null) {
      entity.setId(IdWorker.getId());
    }
    return insertIgnoringDuplicateEvent(entity);
  }

  @Insert(
      """
      INSERT INTO sys_authorization_audit
          (id, event_id, occurred_at, actor_id, subject_type, subject_id, before_revision,
           after_revision, before_configuration, after_configuration, diff_hash, request_id)
      VALUES (#{id}, CAST(#{eventId} AS UUID), #{occurredAt}, #{actorId}, #{subjectType}, #{subjectId},
              #{beforeRevision}, #{afterRevision}, #{beforeConfiguration}, #{afterConfiguration},
              #{diffHash}, #{requestId})
      ON CONFLICT(event_id) DO NOTHING
      """)
  int insertIgnoringDuplicateEvent(AuthorizationAuditEntity entity);

  @Delete("DELETE FROM sys_authorization_audit WHERE occurred_at < #{cutoff}")
  int deleteBefore(@Param("cutoff") LocalDateTime cutoff);

  @Delete(
      """
      DELETE FROM sys_authorization_audit
      WHERE id IN (
        SELECT id FROM sys_authorization_audit
        WHERE occurred_at < #{cutoff}
        ORDER BY occurred_at ASC
        LIMIT #{limit}
      )
      """)
  int deleteBatchBefore(@Param("cutoff") LocalDateTime cutoff, @Param("limit") int limit);

  @Select("SELECT pg_try_advisory_xact_lock(#{lockKey})")
  boolean tryAcquireCleanupLock(@Param("lockKey") long lockKey);
}
