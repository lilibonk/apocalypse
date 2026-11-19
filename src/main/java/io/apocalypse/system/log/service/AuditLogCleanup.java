package io.apocalypse.system.log.service;

import io.apocalypse.system.infrastructure.audit.AuditRetention;
import io.apocalypse.system.infrastructure.audit.AuditRetention.LogTable;

import java.time.Clock;
import java.time.LocalDateTime;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

/** PostgreSQL 会话锁覆盖整轮清理，每批独立提交。 */
@Service
@RequiredArgsConstructor
public class AuditLogCleanup {

  private static final long ADVISORY_LOCK_KEY = 0x4150_4F43_4155_444CL;

  private final AuditRetention retention;

  private final Clock clock;

  @Value("${apocalypse.audit.retention-days:180}")
  private long retentionDays;

  @Scheduled(cron = "${apocalypse.audit.cleanup-cron:0 30 3 * * *}")
  public void cleanup() {
    LocalDateTime cutoff = LocalDateTime.now(clock).minusDays(retentionDays);
    retention.cleanup(ADVISORY_LOCK_KEY, cutoff, LogTable.LOGIN, LogTable.OPERATION);
  }
}
