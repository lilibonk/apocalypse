package io.apocalypse;

import io.apocalypse.calendar.infrastructure.config.CalendarPermissionActions;
import io.apocalypse.framework.security.PermissionActionRegistry;
import io.apocalypse.system.authorization.service.SystemPermissionActions;

import java.util.List;
import java.util.regex.Pattern;

import org.junit.jupiter.api.Test;
import org.springframework.security.access.prepost.PreAuthorize;

import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;

import static org.assertj.core.api.Assertions.assertThat;

/** 静态业务注解必须有精确声明；不依赖运行时扫描自动创建权限。 */
class PermissionActionRegistryTest {
  @Test
  void everyBusinessAuthorityInMethodSecurityIsDeclaredAndOrderRemainsProjectionOnly() {
    var registry =
        new PermissionActionRegistry(
            List.of(SystemPermissionActions.definition(), CalendarPermissionActions.definition()));
    Pattern authority = Pattern.compile("hasAuthority\\('([^']+)'\\)");
    int checked = 0;
    for (var type :
        new ClassFileImporter()
            .withImportOption(new ImportOption.DoNotIncludeTests())
            .importPackages("io.apocalypse")) {
      for (var method : type.getMethods()) {
        if (method.isAnnotatedWith(PreAuthorize.class)) {
          var matcher = authority.matcher(method.getAnnotationOfType(PreAuthorize.class).value());
          while (matcher.find()) {
            assertThat(registry.isExecutable(matcher.group(1)))
                .as("方法 %s 的权限 %s", method.getFullName(), matcher.group(1))
                .isTrue();
            checked++;
          }
        }
      }
    }
    assertThat(checked).isGreaterThanOrEqualTo(90);
    assertThat(registry.find("order:read")).isPresent();
    assertThat(registry.isExecutable("order:read")).isFalse();
  }
}
