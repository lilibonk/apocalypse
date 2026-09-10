package io.apocalypse;

import io.apocalypse.calendar.infrastructure.config.CalendarModuleConfiguration;
import io.apocalypse.calendar.infrastructure.date.ClasspathHolidayPolicyProvider;
import io.apocalypse.framework.capability.CapabilityRegistry;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import tools.jackson.databind.ObjectMapper;

/** 生产配置的故障注入；无外部服务，以 lazy 避免无关运行依赖抢先失败。 */
class CalendarAssemblyFaultTest {

  private ApplicationContextRunner runner(boolean enabled) {
    return new ApplicationContextRunner()
        .withUserConfiguration(CalendarModuleConfiguration.class, Binding.class)
        .withBean(CapabilityRegistry.class)
        .withBean(ObjectMapper.class, ObjectMapper::new)
        .withPropertyValues("apocalypse.capabilities.calendar.enabled=" + enabled)
        .withInitializer(
            context ->
                context.addBeanFactoryPostProcessor(
                    factory -> {
                      for (String name : factory.getBeanDefinitionNames()) {
                        factory.getBeanDefinition(name).setLazyInit(true);
                      }
                    }));
  }

  @Test
  void disabledModuleNeverReadsMissingOrCorruptBundle() {
    for (boolean missing : new boolean[] {true, false}) {
      AtomicInteger reads = new AtomicInteger();
      withBrokenResource(
          missing,
          reads,
          () ->
              runner(false)
                  .withPropertyValues("apocalypse.calendar.import-storage.total-bytes=0")
                  .run(
                      context -> {
                        assertThat(context).hasNotFailed();
                        assertThat(context).doesNotHaveBean(ClasspathHolidayPolicyProvider.class);
                        assertThat(context.containsBean("calendarImportStorageProperties"))
                            .isFalse();
                        assertThat(context.getBean(CapabilityRegistry.class).isEnabled("calendar"))
                            .isFalse();
                        assertThat(reads).hasValue(0);
                      }));
    }
  }

  @Test
  void enabledModuleFailsOnMissingOrHashMismatchedBundle() {
    for (boolean missing : new boolean[] {true, false}) {
      AtomicInteger reads = new AtomicInteger();
      withBrokenResource(
          missing,
          reads,
          () ->
              runner(true)
                  .run(
                      context -> {
                        assertThat(context).hasNotFailed();
                        assertThatThrownBy(
                                () -> context.getBean(ClasspathHolidayPolicyProvider.class))
                            .hasStackTraceContaining(missing ? "资源无法读取" : "SHA-256 不匹配");
                        assertThat(reads.get()).isPositive();
                      }));
    }
  }

  @Test
  void enabledModuleBindsAndRejectsInvalidDedicatedConfiguration() {
    runner(true)
        .withPropertyValues("apocalypse.calendar.import-storage.total-bytes=0")
        .run(
            context -> {
              assertThat(context).hasNotFailed();
              assertThatThrownBy(() -> context.getBean("calendarImportStorageProperties"))
                  .hasStackTraceContaining("totalBytes")
                  .hasStackTraceContaining("Min");
            });
  }

  private static void withBrokenResource(boolean missing, AtomicInteger reads, Runnable assertion) {
    Thread thread = Thread.currentThread();
    ClassLoader original = thread.getContextClassLoader();
    ClassLoader broken =
        new ClassLoader(original) {
          @Override
          public InputStream getResourceAsStream(String name) {
            if (name.equals(ClasspathHolidayPolicyProvider.RESOURCE_PATH)) {
              reads.incrementAndGet();
              return missing
                  ? null
                  : new ByteArrayInputStream("corrupt bundle".getBytes(StandardCharsets.UTF_8));
            }
            return super.getResourceAsStream(name);
          }
        };
    try {
      thread.setContextClassLoader(broken);
      assertion.run();
    } finally {
      thread.setContextClassLoader(original);
    }
  }

  @Configuration(proxyBeanMethods = false)
  @EnableConfigurationProperties
  static class Binding {}
}
