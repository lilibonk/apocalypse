package io.apocalypse.framework.events;

import java.time.Clock;
import javax.sql.DataSource;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.modulith.events.FailedEventPublications;
import org.springframework.modulith.events.core.EventPublicationRepository;
import org.springframework.modulith.events.core.EventSerializer;
import org.springframework.modulith.events.support.CompletionMode;
import org.springframework.util.Assert;

import io.micrometer.core.instrument.MeterRegistry;

/** 保留 Modulith 原仓库；仅恢复任务的同步调用使用审计选择策略。 */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(AuditRecoveryProperties.class)
@ConditionalOnProperty(name = "apocalypse.events.recovery.enabled", matchIfMissing = true)
public class AuditRecoveryConfiguration {

  @Bean
  @Primary
  AuditRecoveryRepository auditRecoveryRepository(
      @Qualifier("jdbcEventPublicationRepository") EventPublicationRepository delegate,
      JdbcTemplate jdbc,
      EventSerializer serializer,
      AuditRecoveryProperties properties,
      Environment environment) {
    verifyConfiguration(environment);
    return new AuditRecoveryRepository(delegate, jdbc, serializer, properties);
  }

  @Bean
  AuditEventRecovery auditEventRecovery(
      AuditRecoveryRepository repository,
      FailedEventPublications publications,
      DataSource dataSource,
      AuditRecoveryProperties properties,
      MeterRegistry meters,
      ObjectProvider<Clock> clocks) {
    return new AuditEventRecovery(
        repository,
        publications,
        dataSource,
        properties,
        meters,
        clocks.getIfAvailable(Clock::systemUTC));
  }

  static void verifyConfiguration(Environment environment) {
    Assert.isTrue(
        !environment.getProperty(
            "spring.modulith.events.jdbc.use-legacy-structure", Boolean.class, false),
        "审计恢复要求 Modulith JDBC V2");
    Assert.isTrue(
        environment.getProperty("spring.modulith.events.jdbc.schema") == null,
        "审计恢复要求使用 Flyway 管理的默认 event_publication 表");
    Assert.isTrue(
        CompletionMode.from(environment) == CompletionMode.UPDATE, "审计恢复要求 Modulith UPDATE 完成模式");
    Assert.isTrue(
        !environment.getProperty(
                "spring.modulith.events.republish-outstanding-events-on-restart",
                Boolean.class,
                false)
            && !environment.getProperty(
                "spring.modulith.republish-outstanding-events-on-restart", Boolean.class, false),
        "审计恢复不能与无界重启重投同时启用");
  }
}
