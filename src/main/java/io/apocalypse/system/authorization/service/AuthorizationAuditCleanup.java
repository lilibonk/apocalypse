package io.apocalypse.system.authorization.service;

import io.apocalypse.system.authorization.mapper.AuthorizationAuditMapper;

import java.time.LocalDateTime;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

/** 与登录/操作日志共享审计保留配置，避免完整授权历史无界增长。 */
@Service
@RequiredArgsConstructor
public class AuthorizationAuditCleanup {
  private final AuthorizationAuditMapper mapper;

  @Value("${apocalypse.audit.retention-days:180}")
  private long retentionDays;

  @Scheduled(cron = "${apocalypse.audit.cleanup-cron:0 30 3 * * *}")
  @Transactional
  public void cleanup() {
    mapper.deleteBefore(LocalDateTime.now().minusDays(retentionDays));
  }
}
