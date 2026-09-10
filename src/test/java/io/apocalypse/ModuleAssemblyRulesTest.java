package io.apocalypse;

import io.apocalypse.assemblyfixtures.AssemblyRuleFixtures.BadResidentEntry;
import io.apocalypse.assemblyfixtures.AssemblyRuleFixtures.CrossModuleImport;
import io.apocalypse.assemblyfixtures.AssemblyRuleFixtures.DuplicateEntry;
import io.apocalypse.assemblyfixtures.AssemblyRuleFixtures.MetaScanEscape;
import io.apocalypse.assemblyfixtures.AssemblyRuleFixtures.RepeatedScanEscape;
import io.apocalypse.assemblyfixtures.AssemblyRuleFixtures.StaticResourceEscape;
import io.apocalypse.assemblyfixtures.AssemblyRuleFixtures.UnreachableConfiguration;
import io.apocalypse.framework.capability.ConditionalOnCapability;
import io.apocalypse.framework.module.ModuleConfiguration;
import io.apocalypse.framework.module.ModuleDiscoveryConfiguration;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.mybatis.spring.annotation.MapperScan;
import org.mybatis.spring.annotation.MapperScans;
import org.springframework.beans.factory.support.BeanDefinitionRegistryPostProcessor;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.TypeExcludeFilter;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.ComponentScans;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.ImportBeanDefinitionRegistrar;
import org.springframework.context.annotation.ImportSelector;
import org.springframework.core.annotation.AnnotatedElementUtils;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaCodeUnit;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;

import static org.assertj.core.api.Assertions.assertThat;

/** 模块装配合同独立于配置本身检查，含主动绕过扫描/动态注册的负例。 */
class ModuleAssemblyRulesTest {

  @Test
  void rootDiscoversOnlySharedComponentsAndMarkedModuleEntrypoints() {
    assertThat(
            ApocalypseApplication.class
                .getAnnotation(SpringBootApplication.class)
                .scanBasePackages())
        .containsExactly("io.apocalypse.common", "io.apocalypse.framework");
    ComponentScan discovery = ModuleDiscoveryConfiguration.class.getAnnotation(ComponentScan.class);
    assertThat(discovery.useDefaultFilters()).isFalse();
    assertThat(discovery.basePackages()).containsExactly("io.apocalypse");
    assertThat(discovery.includeFilters()).hasSize(1);
    assertThat(discovery.includeFilters()[0].classes()).containsExactly(ModuleConfiguration.class);
    assertThat(filterClasses(discovery)).contains(TypeExcludeFilter.class);
  }

  @Test
  void everyBusinessConfigurationHasOneModuleOwnerAndNoScanBypass() {
    List<Class<?>> types =
        new ClassFileImporter()
                .withImportOption(new ImportOption.DoNotIncludeTests())
                .importPackages("io.apocalypse")
                .stream()
                .<Class<?>>map(type -> type.reflect())
                .toList();
    assertThat(violations(types)).isEmpty();

    List<Class<?>> entries =
        types.stream().filter(type -> type.isAnnotationPresent(ModuleConfiguration.class)).toList();
    Set<Class<?>> reachable = new HashSet<>();
    entries.forEach(type -> collectImports(type, reachable));
    for (Class<?> type : types) {
      if (business(type) && AnnotatedElementUtils.hasAnnotation(type, Configuration.class)) {
        assertThat(reachable).as("配置必须从模块入口可达: %s", type).contains(type);
      }
    }
    Set<String> modules = new HashSet<>();
    types.stream()
        .filter(ModuleAssemblyRulesTest::business)
        .forEach(type -> modules.add(owner(type)));
    for (String module : modules) {
      assertThat(entries.stream().filter(type -> owner(type).equals(module)).toList())
          .as("每个业务模块恰有一个入口: %s", module)
          .hasSize(1);
    }
  }

  @Test
  void rootWideMapperAndComponentScansAndDynamicRegistrationAreRejected() {
    assertThat(violations(List.of(BroadScan.class))).anyMatch(message -> message.contains("扫描"));
    assertThat(violations(List.of(BroadMapper.class)))
        .anyMatch(message -> message.contains("Mapper"));
    assertThat(violations(List.of(DynamicRegistrar.class)))
        .anyMatch(message -> message.contains("动态注册"));
    assertThat(violations(List.of(CrossModuleImport.class)))
        .anyMatch(message -> message.contains("跨模块导入"));
    assertThat(residentViolations(BadResidentEntry.class))
        .anyMatch(message -> message.contains("运行依赖"));
  }

  @Test
  void optionalResidentBeansDoNotRequireRuntimeComponents() {
    new ClassFileImporter()
            .withImportOption(new ImportOption.DoNotIncludeTests())
            .importPackages("io.apocalypse")
            .stream()
            .map(type -> type.reflect())
            .filter(type -> type.isAnnotationPresent(ModuleConfiguration.class))
            .forEach(type -> assertThat(residentViolations(type)).isEmpty());
  }

  @Test
  void composedRepeatedScansAndMissingOrDuplicateEntrypointsAreRejected() {
    assertThat(violations(List.of(MetaScanEscape.class)))
        .anyMatch(message -> message.contains("扫描"));
    assertThat(violations(List.of(RepeatedScanEscape.class)))
        .anyMatch(message -> message.contains("扫描"));
    assertThat(violations(List.of(UnreachableConfiguration.class)))
        .anyMatch(message -> message.contains("非入口配置"));
    assertThat(violations(List.of(BadResidentEntry.class, DuplicateEntry.class)))
        .anyMatch(message -> message.contains("恰有一个入口"));
  }

  private static List<String> violations(List<Class<?>> types) {
    List<String> errors = new ArrayList<>();
    for (Class<?> type : types) {
      if (type == ModuleDiscoveryConfiguration.class || type == ApocalypseApplication.class)
        continue;
      var scans =
          AnnotatedElementUtils.getMergedRepeatableAnnotations(
              type, ComponentScan.class, ComponentScans.class);
      var mappers =
          AnnotatedElementUtils.getMergedRepeatableAnnotations(
              type, MapperScan.class, MapperScans.class);
      Import imported = AnnotatedElementUtils.findMergedAnnotation(type, Import.class);
      if (imported != null && business(type)) {
        for (Class<?> target : imported.value()) {
          if (business(target) && !owner(type).equals(owner(target))) {
            errors.add(type + ": 禁止跨模块导入 " + target);
          }
        }
      }
      for (ComponentScan scan : scans) {
        List<String> packages = new ArrayList<>(List.of(scan.basePackages()));
        packages.addAll(List.of(scan.value()));
        Arrays.stream(scan.basePackageClasses())
            .forEach(item -> packages.add(item.getPackageName()));
        if (!business(type)
            || packages.isEmpty()
            || packages.stream().anyMatch(value -> !within(value, owner(type)))) {
          errors.add(type + ": 扫描必须限定所属模块");
        }
        if (!filterClasses(scan)
            .containsAll(List.of(Configuration.class, TypeExcludeFilter.class))) {
          errors.add(type + ": 扫描必须排除配置类并保留测试过滤器");
        }
        if (!type.isAnnotationPresent(ModuleConfiguration.class)
            && !type.isAnnotationPresent(ConditionalOnCapability.class)) {
          errors.add(type + ": 扫描只允许入口或带能力条件的运行配置");
        }
      }
      for (MapperScan mapper : mappers) {
        List<String> packages = new ArrayList<>(List.of(mapper.basePackages()));
        packages.addAll(List.of(mapper.value()));
        Arrays.stream(mapper.basePackageClasses())
            .forEach(item -> packages.add(item.getPackageName()));
        if (!business(type)
            || packages.isEmpty()
            || packages.stream().anyMatch(value -> !within(value, owner(type)))) {
          errors.add(type + ": Mapper 扫描必须限定所属模块");
        }
      }
      if (!type.getName().startsWith("io.apocalypse.framework.")
          && (ImportSelector.class.isAssignableFrom(type)
              || ImportBeanDefinitionRegistrar.class.isAssignableFrom(type)
              || BeanDefinitionRegistryPostProcessor.class.isAssignableFrom(type))) {
        errors.add(type + ": 业务模块禁止自行动态注册");
      }
    }
    List<Class<?>> entries =
        types.stream().filter(type -> type.isAnnotationPresent(ModuleConfiguration.class)).toList();
    Set<Class<?>> reachable = new HashSet<>();
    entries.forEach(type -> collectImports(type, reachable));
    for (Class<?> type : types) {
      if (!business(type) || !AnnotatedElementUtils.hasAnnotation(type, Configuration.class))
        continue;
      if (!reachable.contains(type)) errors.add(type + ": 非入口配置泄漏");
      if (entries.stream().filter(entry -> owner(entry).equals(owner(type))).count() != 1)
        errors.add(type + ": 模块必须恰有一个入口");
    }
    return errors;
  }

  @Test
  void staticInitializersCannotReadRuntimeResourcesIncludingThroughLocalHelpers() {
    assertThat(
            staticResourceViolations(
                new ClassFileImporter()
                    .withImportOption(new ImportOption.DoNotIncludeTests())
                    .importPackages("io.apocalypse")))
        .isEmpty();
    assertThat(
            staticResourceViolations(
                new ClassFileImporter().importClasses(StaticResourceEscape.class)))
        .anyMatch(message -> message.contains("getResourceAsStream"));
  }

  private static List<String> staticResourceViolations(JavaClasses types) {
    List<String> errors = new ArrayList<>();
    for (var type : types) {
      if (business(type.reflect()))
        type.getStaticInitializer()
            .ifPresent(unit -> findResourceCalls(unit, new HashSet<>(), errors));
    }
    return errors;
  }

  private static void findResourceCalls(
      JavaCodeUnit unit, Set<JavaCodeUnit> seen, List<String> errors) {
    if (!seen.add(unit)) return;
    for (var call : unit.getCallsFromSelf()) {
      var target = call.getTarget();
      String ownerName = target.getOwner().getName();
      String name = target.getName();
      if (ownerName.equals("java.nio.file.Files")
          || ownerName.equals("java.io.FileInputStream")
          || ownerName.equals("java.io.FileReader")
          || name.equals("getResourceAsStream")
          || (ownerName.startsWith("org.springframework.core.io.") && name.equals("getInputStream"))
          || (ownerName.startsWith("java.net.")
              && (name.equals("openStream") || name.equals("openConnection")))) {
        errors.add(unit.getFullName() + ": static 运行资源访问 " + target.getFullName());
      }
      if (ownerName.startsWith("io.apocalypse."))
        target.resolveMember().ifPresent(next -> findResourceCalls(next, seen, errors));
    }
  }

  private static List<String> residentViolations(Class<?> entry) {
    Set<Class<?>> imports = new HashSet<>();
    collectImports(entry, imports);
    if (imports.stream().noneMatch(type -> type.isAnnotationPresent(ConditionalOnCapability.class)))
      return List.of();
    Set<Class<?>> residents = new HashSet<>();
    collectResidents(entry, residents);
    List<String> errors = new ArrayList<>();
    for (Class<?> resident : residents) {
      List<Class<?>> dependencies = new ArrayList<>();
      Arrays.stream(resident.getDeclaredFields())
          .forEach(field -> dependencies.add(field.getType()));
      Arrays.stream(resident.getDeclaredConstructors())
          .forEach(constructor -> dependencies.addAll(List.of(constructor.getParameterTypes())));
      Arrays.stream(resident.getDeclaredMethods())
          .forEach(method -> dependencies.addAll(List.of(method.getParameterTypes())));
      for (Class<?> dependency : dependencies) {
        if (business(dependency)
            && !residents.contains(dependency)
            && !dependency.getPackageName().endsWith(".api")) {
          errors.add(resident + ": 常驻组件禁止直接运行依赖 " + dependency);
        }
      }
    }
    return errors;
  }

  private static void collectResidents(Class<?> type, Set<Class<?>> result) {
    if (type.isAnnotationPresent(ConditionalOnCapability.class) || !result.add(type)) return;
    Import annotation = AnnotatedElementUtils.findMergedAnnotation(type, Import.class);
    if (annotation != null)
      Arrays.stream(annotation.value()).forEach(next -> collectResidents(next, result));
  }

  private static boolean within(String value, String owner) {
    return value.equals(owner) || value.startsWith(owner + ".");
  }

  private static List<Class<?>> filterClasses(ComponentScan scan) {
    return Arrays.stream(scan.excludeFilters())
        .flatMap(filter -> Arrays.stream(filter.classes()))
        .toList();
  }

  private static boolean business(Class<?> type) {
    String name = type.getName();
    return name.startsWith("io.apocalypse.")
        && !name.startsWith("io.apocalypse.common.")
        && !name.startsWith("io.apocalypse.framework.")
        && type.getPackageName().split("\\.").length >= 3;
  }

  private static String owner(Class<?> type) {
    return String.join(".", Arrays.copyOf(type.getPackageName().split("\\."), 3));
  }

  private static void collectImports(Class<?> type, Set<Class<?>> result) {
    if (!result.add(type)) return;
    Import annotation = AnnotatedElementUtils.findMergedAnnotation(type, Import.class);
    if (annotation != null)
      Arrays.stream(annotation.value()).forEach(next -> collectImports(next, result));
  }

  @ComponentScan("io.apocalypse")
  static class BroadScan {}

  @MapperScan("io.apocalypse")
  static class BroadMapper {}

  abstract static class DynamicRegistrar implements ImportBeanDefinitionRegistrar {}
}
