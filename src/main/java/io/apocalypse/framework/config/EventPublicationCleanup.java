package io.apocalypse.framework.config;

import java.time.Duration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.modulith.events.CompletedEventPublications;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

/** 定期清理已完成的事件登记；未完成事件始终保留，以便框架重投。多实例通过 PostgreSQL 事务级 advisory lock 互斥。 */
@Component
@RequiredArgsConstructor
public class EventPublicationCleanup {

  private static final long ADVISORY_LOCK_KEY = 0x4150_4F43_4556_5443L;

  private final CompletedEventPublications completedEventPublications;

  private final JdbcTemplate jdbcTemplate;

  @Value("${apocalypse.events.completed-retention-days:7}")
  private long retentionDays;

  @Scheduled(cron = "${apocalypse.events.cleanup-cron:0 15 3 * * *}")
  @Transactional
  public void cleanup() {
    Boolean acquired =
        jdbcTemplate.queryForObject(
            "SELECT pg_try_advisory_xact_lock(?)", Boolean.class, ADVISORY_LOCK_KEY);
    if (!Boolean.TRUE.equals(acquired)) {
      return;
    }
    completedEventPublications.deletePublicationsOlderThan(Duration.ofDays(retentionDays));
  }
}
