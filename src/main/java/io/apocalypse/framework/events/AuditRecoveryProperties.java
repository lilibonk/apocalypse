package io.apocalypse.framework.events;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.util.Assert;

/** 审计恢复的硬边界；最大尝试次数包含第一次消费。 */
@ConfigurationProperties("apocalypse.events.recovery")
public record AuditRecoveryProperties(
    @DefaultValue("50") int batchSize,
    @DefaultValue("100") int maxInFlight,
    @DefaultValue("5") int maxAttempts,
    @DefaultValue("1m") Duration initialBackoff,
    @DefaultValue("15m") Duration maxBackoff,
    @DefaultValue("10m") Duration staleAfter) {

  public AuditRecoveryProperties {
    Assert.isTrue(batchSize >= 1 && batchSize <= 500, "审计恢复 batch-size 必须为 1..500");
    Assert.isTrue(
        maxInFlight >= batchSize && maxInFlight <= 1000,
        "审计恢复 max-in-flight 必须在 batch-size..1000 之间");
    Assert.isTrue(maxAttempts >= 1 && maxAttempts <= 20, "审计恢复 max-attempts 必须为 1..20");
    positive(initialBackoff, "initial-backoff");
    positive(maxBackoff, "max-backoff");
    positive(staleAfter, "stale-after");
    Assert.isTrue(
        maxBackoff.compareTo(initialBackoff) >= 0, "审计恢复 max-backoff 不得小于 initial-backoff");
  }

  private static void positive(Duration value, String name) {
    Assert.notNull(value, "审计恢复 " + name + " 不能为空");
    Assert.isTrue(
        value.toMillis() > 0 && value.compareTo(Duration.ofDays(1)) <= 0,
        "审计恢复 " + name + " 必须在 1ms..1d 之间");
  }
}
