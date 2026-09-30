package io.apocalypse.framework.events;

import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.modulith.events.EventPublication.Status;
import org.springframework.modulith.events.core.EventPublicationRepository;
import org.springframework.modulith.events.core.EventPublicationRepository.FailedCriteria;
import org.springframework.modulith.events.core.EventSerializer;
import org.springframework.modulith.events.core.PublicationTargetIdentifier;
import org.springframework.modulith.events.core.TargetEventPublication;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;

class AuditRecoveryRepositoryTest {

  private final EventPublicationRepository delegate = mock(EventPublicationRepository.class);
  private final AuditRecoveryRepository repository =
      new AuditRecoveryRepository(
          delegate, mock(JdbcTemplate.class), mock(EventSerializer.class), properties());

  @Test
  void everyUpstreamRepositoryMethodDelegatesOutsideRecoveryScope() throws Exception {
    Map<Class<?>, Object> arguments =
        Map.of(
            Object.class,
            new Object(),
            Instant.class,
            Instant.now(),
            UUID.class,
            UUID.randomUUID(),
            TargetEventPublication.class,
            mock(TargetEventPublication.class),
            PublicationTargetIdentifier.class,
            PublicationTargetIdentifier.of("listener"),
            List.class,
            List.of(UUID.randomUUID()),
            Status.class,
            Status.FAILED,
            FailedCriteria.class,
            FailedCriteria.ALL);

    for (Method method : EventPublicationRepository.class.getMethods()) {
      if (Modifier.isStatic(method.getModifiers())) {
        continue;
      }
      // 上游增加默认方法时也必须显式委托，避免在适配器悄悄退化成默认空实现。
      assertThat(
              repository
                  .getClass()
                  .getMethod(method.getName(), method.getParameterTypes())
                  .getDeclaringClass())
          .isEqualTo(AuditRecoveryRepository.class);
      Object[] values =
          Arrays.stream(method.getParameterTypes())
              .map(
                  type -> {
                    assertThat(arguments).containsKey(type);
                    return arguments.get(type);
                  })
              .toArray();
      clearInvocations(delegate);
      method.invoke(repository, values);
      method.invoke(verify(delegate), values);
      verifyNoMoreInteractions(delegate);
    }
  }

  @Test
  void recoveryScopeIsRemovedEvenWhenDispatchFails() {
    assertThatThrownBy(
            () ->
                repository.recover(
                    Instant.now(),
                    () -> {
                      throw new IllegalStateException("synthetic dispatch failure");
                    }))
        .isInstanceOf(IllegalStateException.class);

    repository.findFailedPublications(FailedCriteria.ALL);
    verify(delegate).findFailedPublications(FailedCriteria.ALL);
  }

  @Test
  void recoveryScopeDoesNotLeakToConsumerThreads() throws Exception {
    repository.recover(
        Instant.now(),
        () -> {
          Thread consumer =
              Thread.ofPlatform().start(() -> repository.countByStatus(Status.FAILED));
          try {
            consumer.join();
          } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(exception);
          }
        });
    verify(delegate).countByStatus(Status.FAILED);
  }

  @Test
  void incompatibleUpstreamSettingsFailExplicitly() {
    AuditRecoveryConfiguration.verifyConfiguration(new MockEnvironment());
    for (Map.Entry<String, String> setting :
        Map.of(
                "spring.modulith.events.jdbc.use-legacy-structure", "true",
                "spring.modulith.events.jdbc.schema", "elsewhere",
                "spring.modulith.events.completion-mode", "DELETE",
                "spring.modulith.events.republish-outstanding-events-on-restart", "true",
                "spring.modulith.republish-outstanding-events-on-restart", "true")
            .entrySet()) {
      assertThatThrownBy(
              () ->
                  AuditRecoveryConfiguration.verifyConfiguration(
                      new MockEnvironment().withProperty(setting.getKey(), setting.getValue())))
          .isInstanceOf(IllegalArgumentException.class);
    }
  }

  @Test
  void disablingRecoveryLeavesOnlyTheOriginalRepository() {
    new ApplicationContextRunner()
        .withUserConfiguration(AuditRecoveryConfiguration.class)
        .withBean(
            "jdbcEventPublicationRepository", EventPublicationRepository.class, () -> delegate)
        .withPropertyValues("apocalypse.events.recovery.enabled=false")
        .run(
            context -> {
              assertThat(context).doesNotHaveBean(AuditRecoveryRepository.class);
              assertThat(context).doesNotHaveBean(AuditEventRecovery.class);
              assertThat(context.getBean(EventPublicationRepository.class)).isSameAs(delegate);
            });
  }

  @Test
  void configurationRejectsUnboundedOrInvalidRecovery() {
    assertThatThrownBy(
            () ->
                new AuditRecoveryProperties(
                    0,
                    100,
                    5,
                    Duration.ofMinutes(1),
                    Duration.ofMinutes(15),
                    Duration.ofMinutes(10)))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(
            () ->
                new AuditRecoveryProperties(
                    50,
                    10,
                    5,
                    Duration.ofMinutes(1),
                    Duration.ofMinutes(15),
                    Duration.ofMinutes(10)))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(
            () ->
                new AuditRecoveryProperties(
                    50,
                    100,
                    21,
                    Duration.ofMinutes(1),
                    Duration.ofMinutes(15),
                    Duration.ofMinutes(10)))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(
            () ->
                new AuditRecoveryProperties(
                    50, 100, 5, Duration.ZERO, Duration.ofMinutes(15), Duration.ofMinutes(10)))
        .isInstanceOf(IllegalArgumentException.class);
  }

  private static AuditRecoveryProperties properties() {
    return new AuditRecoveryProperties(
        50, 100, 5, Duration.ofMinutes(1), Duration.ofMinutes(15), Duration.ofMinutes(10));
  }
}
