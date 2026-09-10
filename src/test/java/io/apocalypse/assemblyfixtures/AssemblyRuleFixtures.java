package io.apocalypse.assemblyfixtures;

import io.apocalypse.framework.capability.ConditionalOnCapability;
import io.apocalypse.framework.module.ModuleConfiguration;
import io.apocalypse.system.user.mapper.SysUserMapper;

import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Import;

/** 仅用于架构规则反例；不能被生产或普通测试宿主发现。 */
public final class AssemblyRuleFixtures {
  private AssemblyRuleFixtures() {}

  @Import(SysUserMapper.class)
  public static class CrossModuleImport {}

  @TestConfiguration(proxyBeanMethods = false)
  @ModuleConfiguration
  @Import({BadResident.class, ProbeRuntime.class})
  public static class BadResidentEntry {}

  public static class BadResident {
    public BadResident(ProbeRuntime dependency) {}
  }

  @ConditionalOnCapability("probe")
  public static class ProbeRuntime {}

  @Retention(RetentionPolicy.RUNTIME)
  @ComponentScan("io.apocalypse")
  public @interface ComposedBroadScan {}

  @ComposedBroadScan
  public static class MetaScanEscape {}

  @ComponentScan("io.apocalypse.assemblyfixtures")
  @ComponentScan("io.apocalypse.system")
  public static class RepeatedScanEscape {}

  @TestConfiguration(proxyBeanMethods = false)
  public static class UnreachableConfiguration {}

  @TestConfiguration(proxyBeanMethods = false)
  @ModuleConfiguration
  public static class DuplicateEntry {}

  public static class StaticResourceEscape {
    static final Object RESOURCE = readResource();

    private static Object readResource() {
      return StaticResourceEscape.class.getResourceAsStream("/must-not-read.txt");
    }
  }
}
