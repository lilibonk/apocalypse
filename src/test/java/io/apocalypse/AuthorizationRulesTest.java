package io.apocalypse;

import io.apocalypse.calendar.infrastructure.config.CalendarPermissionActions;
import io.apocalypse.framework.security.AuthorizationContextAdvisor;
import io.apocalypse.framework.security.LiveAuthorizationManagerFactory;
import io.apocalypse.framework.security.PermissionActionRegistry;
import io.apocalypse.system.authorization.mapper.AuthorizationReadMapper;
import io.apocalypse.system.authorization.mapper.DataScopeMapper;
import io.apocalypse.system.authorization.service.SystemPermissionActions;
import io.apocalypse.system.menu.service.MenuService;

import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

import org.apache.ibatis.annotations.Select;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.context.annotation.Role;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.authorization.AuthorizationManagerFactory;
import org.springframework.security.authorization.method.AuthorizationInterceptorsOrder;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/** 可自动证明的授权边界；资源 ownership 和并发正确性另由集成测试覆盖。 */
class AuthorizationRulesTest {
  private static final JavaClasses CLASSES =
      new ClassFileImporter()
          .withImportOption(new ImportOption.DoNotIncludeTests())
          .importPackages("io.apocalypse");

  @Test
  void businessMethodGuardsOnlyUseRegisteredLiteralPermissionExpressions() {
    var registry =
        new PermissionActionRegistry(
            List.of(SystemPermissionActions.definition(), CalendarPermissionActions.definition()));
    Pattern call = Pattern.compile("has(?:Any|All)?Authorit(?:y|ies)\\(([^)]*)\\)");
    Pattern argument = Pattern.compile("'([^']+)'");
    for (var type : CLASSES) {
      if (!type.getPackageName().startsWith("io.apocalypse.system.")
          && !type.getPackageName().startsWith("io.apocalypse.calendar.")) continue;
      for (var method : type.getMethods()) {
        if (!method.isAnnotatedWith(PreAuthorize.class)) continue;
        String expression = method.getAnnotationOfType(PreAuthorize.class).value();
        var matcher = call.matcher(expression);
        int calls = 0;
        while (matcher.find()) {
          var args = argument.matcher(matcher.group(1));
          int count = 0;
          while (args.find()) {
            assertThat(registry.isExecutable(args.group(1))).as(method.getFullName()).isTrue();
            count++;
          }
          assertThat(count).as("权限动作必须是声明中的字面量: %s", method.getFullName()).isPositive();
          assertThat(matcher.group(1).replaceAll("'[^']+'", "").replace(",", "").trim()).isEmpty();
          calls++;
        }
        assertThat(calls).as("业务守卫不得绕过实时动作入口: %s", method.getFullName()).isPositive();
        assertThat(
                call.matcher(expression)
                    .replaceAll("")
                    .replaceAll("\\band\\b|\\bor\\b|&&|\\|\\||[()\\s]", ""))
            .as("业务守卫只组合已登记的权限: %s", method.getFullName())
            .isEmpty();
      }
    }
  }

  @Test
  void liveFactoryIsUniqueAndItsScopeAdvisorIsInfrastructureBeforePreAuthorize() {
    assertThat(
            CLASSES.stream()
                .filter(type -> type.isAssignableTo(AuthorizationManagerFactory.class))
                .map(type -> type.getName())
                .toList())
        .containsExactly(LiveAuthorizationManagerFactory.class.getName());
    assertThat(AuthorizationContextAdvisor.class.getAnnotation(Role.class).value())
        .isEqualTo(BeanDefinition.ROLE_INFRASTRUCTURE);
    var advisor = new AuthorizationContextAdvisor(mock(ObjectProvider.class));
    assertThat(advisor.getOrder())
        .isLessThan(AuthorizationInterceptorsOrder.PRE_AUTHORIZE.getOrder());
  }

  @Test
  void runtimeAuthorizationSqlNeverReadsTheLegacyMenuGrantSource() {
    Pattern oldSource = Pattern.compile("\\bsys_(?:role_menu|menu)\\b", Pattern.CASE_INSENSITIVE);
    for (Class<?> mapper : List.of(AuthorizationReadMapper.class, DataScopeMapper.class)) {
      for (var method : mapper.getMethods()) {
        var select = method.getAnnotation(Select.class);
        if (select != null) {
          assertThat(oldSource.matcher(String.join("\n", select.value())).find())
              .as("运行授权 SQL 不依赖菜单: %s", method)
              .isFalse();
        }
      }
    }
  }

  @Test
  void businessCodeCannotReadRawAuthenticationAuthoritiesOrJwtAuthorityLists() {
    Set<String> identityBridges =
        Set.of(
            "io.apocalypse.framework.security.SecurityConfig",
            "io.apocalypse.framework.security.SecurityUtils");
    for (var type : CLASSES) {
      for (var call : type.getMethodCallsFromSelf()) {
        if ("getAuthorities".equals(call.getTarget().getName())
            || "getClaimAsStringList".equals(call.getTarget().getName())) {
          assertThat(identityBridges)
              .as("原始权限读取仅限认证/身份桥: %s", call.getDescription())
              .contains(type.getName());
        }
      }
    }
  }

  @Test
  void legacyPermissionServiceEntryPointsCannotCacheTimeDependentPermissions() throws Exception {
    assertThat(
            MenuService.class.getMethod("permsByUserId", Long.class).getAnnotation(Cacheable.class))
        .isNull();
    assertThat(
            MenuService.class
                .getMethod("freshPermsByUserId", Long.class)
                .getAnnotation(Cacheable.class))
        .isNull();
  }
}
