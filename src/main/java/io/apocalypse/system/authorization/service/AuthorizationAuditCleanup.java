package io.apocalypse.system.authorization.service;

import io.apocalypse.system.authorization.mapper.AuthorizationAuditMapper;

import java.time.Clock;
import java.time.LocalDateTime;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

/** 与登录/操作日志共享审计保留配置，采用事务级 advisory lock 与分批删除避免多实例竞争和长事务锁表。 */
@Service
@RequiredArgsConstructor
public class AuthorizationAuditCleanup {

  private static final long ADVISORY_LOCK_KEY = 0x4150_4F43_4155_5448L;

  private static final int BATCH_LIMIT = 5_000;

  private static final int MAX_BATCHES_PER_RUN = 20;

  private final AuthorizationAuditMapper mapper;

  private final Clock clock;

  @Value("${apocalypse.audit.retention-days:180}")
  private long retentionDays;

  @Scheduled(cron = "${apocalypse.audit.cleanup-cron:0 30 3 * * *}")
  @Transactional
  public void cleanup() {
    if (!mapper.tryAcquireCleanupLock(ADVISORY_LOCK_KEY)) {
      return;
    }
    LocalDateTime cutoff = LocalDateTime.now(clock).minusDays(retentionDays);
    for (int i = 0; i < MAX_BATCHES_PER_RUN; i++) {
      if (mapper.deleteBatchBefore(cutoff, BATCH_LIMIT) < BATCH_LIMIT) {
        break;
      }
    }
  }
}
