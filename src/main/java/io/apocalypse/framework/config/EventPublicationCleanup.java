package io.apocalypse.framework.config;

import java.time.Duration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.modulith.events.CompletedEventPublications;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

/** 定期清理已完成的事件登记；未完成事件始终保留，以便框架重投。 */
@Component
@RequiredArgsConstructor
public class EventPublicationCleanup {

  private final CompletedEventPublications completedEventPublications;

  @Value("${apocalypse.events.completed-retention-days:7}")
  private long retentionDays;

  @Scheduled(cron = "${apocalypse.events.cleanup-cron:0 15 3 * * *}")
  public void cleanup() {
    completedEventPublications.deletePublicationsOlderThan(Duration.ofDays(retentionDays));
  }
}
