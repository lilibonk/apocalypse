package io.apocalypse.system.log.service;

import io.apocalypse.system.log.mapper.SysLoginLogMapper;
import io.apocalypse.system.log.mapper.SysOperLogMapper;

import java.time.Clock;
import java.time.LocalDateTime;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

/** 审计日志保留策略。采用 PostgreSQL 事务级 advisory lock 保证多实例互斥，并按分批 {@code LIMIT} 裁剪历史，避免长事务锁表与 WAL 尖峰。 */
@Service
@RequiredArgsConstructor
public class AuditLogCleanup {

  private static final long ADVISORY_LOCK_KEY = 0x4150_4F43_4155_444CL;

  private static final int BATCH_LIMIT = 5_000;

  private static final int MAX_BATCHES_PER_RUN = 20;

  private final SysLoginLogMapper sysLoginLogMapper;

  private final SysOperLogMapper sysOperLogMapper;

  private final Clock clock;

  @Value("${apocalypse.audit.retention-days:180}")
  private long retentionDays;

  @Scheduled(cron = "${apocalypse.audit.cleanup-cron:0 30 3 * * *}")
  @Transactional
  public void cleanup() {
    if (!sysLoginLogMapper.tryAcquireCleanupLock(ADVISORY_LOCK_KEY)) {
      return;
    }
    LocalDateTime cutoff = LocalDateTime.now(clock).minusDays(retentionDays);
    for (int i = 0; i < MAX_BATCHES_PER_RUN; i++) {
      if (sysLoginLogMapper.deleteBatchBefore(cutoff, BATCH_LIMIT) < BATCH_LIMIT) {
        break;
      }
    }
    for (int i = 0; i < MAX_BATCHES_PER_RUN; i++) {
      if (sysOperLogMapper.deleteBatchBefore(cutoff, BATCH_LIMIT) < BATCH_LIMIT) {
        break;
      }
    }
  }
}
