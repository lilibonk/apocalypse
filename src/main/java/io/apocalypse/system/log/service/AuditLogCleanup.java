package io.apocalypse.system.log.service;

import io.apocalypse.system.log.mapper.SysLoginLogMapper;
import io.apocalypse.system.log.mapper.SysOperLogMapper;

import java.time.LocalDateTime;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

/** 审计日志保留策略。删除动作独立成短事务，避免长期增长拖慢日常查询。 */
@Service
@RequiredArgsConstructor
public class AuditLogCleanup {

  private final SysLoginLogMapper sysLoginLogMapper;

  private final SysOperLogMapper sysOperLogMapper;

  @Value("${apocalypse.audit.retention-days:180}")
  private long retentionDays;

  @Scheduled(cron = "${apocalypse.audit.cleanup-cron:0 30 3 * * *}")
  @Transactional
  public void cleanup() {
    LocalDateTime cutoff = LocalDateTime.now().minusDays(retentionDays);
    sysLoginLogMapper.deleteBefore(cutoff);
    sysOperLogMapper.deleteBefore(cutoff);
  }
}
