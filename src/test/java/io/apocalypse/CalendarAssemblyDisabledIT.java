package io.apocalypse;

import io.apocalypse.calendar.api.CalendarProjectionApi;
import io.apocalypse.calendar.api.ProjectionBatchCommand;
import io.apocalypse.calendar.application.CalendarCapabilityGuard;
import io.apocalypse.calendar.application.GuardedCalendarProjectionApi;
import io.apocalypse.common.exception.BizException;
import io.apocalypse.system.user.mapper.SysUserMapper;

import java.util.List;

import org.apache.ibatis.session.SqlSessionFactory;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionEvaluationReport;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.stereotype.Component;

import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 真实宿主扫描：坏专属参数在关闭时不绑定，所有运行 bean/Mapper 都不存在。 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "apocalypse.capabilities.calendar.enabled=false",
      "apocalypse.calendar.import-storage.total-bytes=0"
    })
class CalendarAssemblyDisabledIT extends AbstractIntegrationTest {

  @Autowired private ApplicationContext context;

  @Autowired private SqlSessionFactory sqlSessionFactory;

  @Test
  void optionalRuntimeIsAbsentWhileCoreAndStableFacadeRemain() {
    assertComponents(context, false);
    assertThat(sqlSessionFactory.getConfiguration().getMapperRegistry().getMappers())
        .noneMatch(type -> type.getName().startsWith("io.apocalypse.calendar."));
    assertThat(context.getBean(SysUserMapper.class)).isNotNull();
    var fallback =
        ConditionEvaluationReport.get(((ConfigurableApplicationContext) context).getBeanFactory())
            .getConditionAndOutcomesBySource()
            .entrySet()
            .stream()
            .filter(entry -> entry.getKey().contains("MapperScannerRegistrarNotFoundConfiguration"))
            .toList();
    assertThat(fallback).hasSize(1);
    assertThat(fallback.getFirst().getValue().isFullMatch()).isFalse();
    assertThatThrownBy(
            () ->
                context
                    .getBean(CalendarProjectionApi.class)
                    .upsert(new ProjectionBatchCommand("probe", "scope", List.of())))
        .isInstanceOfSatisfying(
            BizException.class, error -> assertThat(error.getCode()).isEqualTo(11000));
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);
    assertThat(getForData("/system/users/me", token).get("user")).isNotNull();
  }

  static void assertComponents(ApplicationContext context, boolean enabled) {
    List<Class<?>> components =
        new ClassFileImporter()
                .withImportOption(new ImportOption.DoNotIncludeTests())
                .importPackages("io.apocalypse.calendar")
                .stream()
                .<Class<?>>map(type -> type.reflect())
                .filter(type -> AnnotatedElementUtils.hasAnnotation(type, Component.class))
                .filter(type -> !AnnotatedElementUtils.hasAnnotation(type, Configuration.class))
                .toList();
    assertThat(components).hasSize(40);
    for (Class<?> component : components) {
      boolean resident =
          component == CalendarCapabilityGuard.class
              || component == GuardedCalendarProjectionApi.class;
      assertThat(context.getBeanNamesForType(component))
          .as("bean %s", component.getName())
          .hasSize(resident || enabled ? 1 : 0);
    }
  }
}
