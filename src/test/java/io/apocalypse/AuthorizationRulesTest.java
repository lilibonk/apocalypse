package io.apocalypse;

import io.apocalypse.calendar.infrastructure.config.CalendarPermissionActions;
import io.apocalypse.framework.security.AuthorizationContextAdvisor;
import io.apocalypse.framework.security.LiveAuthorizationManagerFactory;
import io.apocalypse.framework.security.LiveAuthorizationService;
import io.apocalypse.framework.security.PermissionActionRegistry;
import io.apocalypse.system.authorization.mapper.AuthorizationReadMapper;
import io.apocalypse.system.authorization.mapper.DataScopeMapper;
import io.apocalypse.system.authorization.service.SystemPermissionActions;
import io.apocalypse.system.menu.service.MenuService;

import java.lang.annotation.Annotation;
import java.util.ArrayDeque;
import java.util.HashSet;
import java.util.List;
import java.util.Queue;
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
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaCodeUnit;
import com.tngtech.archunit.core.domain.JavaMethod;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/** 可自动证明的授权边界；资源 ownership 和并发正确性另由集成测试覆盖。 */
class AuthorizationRulesTest {
  private static final Set<String> SELF_SERVICE_ENDPOINTS =
      Set.of(
          "io.apocalypse.system.user.controller.UserController#me",
          "io.apocalypse.system.user.controller.UserController#updateMyProfile",
          "io.apocalypse.system.user.controller.UserController#updateMyPassword",
          "io.apocalypse.system.user.controller.UserController#mySessions",
          "io.apocalypse.system.user.controller.UserController#revokeMySession",
          "io.apocalypse.system.user.controller.UserController#revokeAllMySessions",
          "io.apocalypse.system.realtime.controller.RealtimeStreamController#stream");

  private static final List<Class<? extends Annotation>> MAPPING_ANNOTATIONS =
      List.of(
          RequestMapping.class,
          GetMapping.class,
          PostMapping.class,
          PutMapping.class,
          DeleteMapping.class,
          PatchMapping.class);

  private static final JavaClasses CLASSES =
      new ClassFileImporter()
          .withImportOption(new ImportOption.DoNotIncludeTests())
          .importPackages("io.apocalypse");

  @Test
  void everyBusinessControllerEndpointDeclaresPreAuthorizeExceptAuditedSelfServiceAllowlist() {
    Set<String> seenSelfService = new HashSet<>();
    for (var type : CLASSES) {
      if (type.getPackageName().startsWith("io.apocalypse.framework.")
          || !type.isAnnotatedWith(RestController.class)) {
        continue;
      }
      for (var method : type.getMethods()) {
        if (!isWebEndpoint(method)) {
          continue;
        }
        String key = type.getName() + "#" + method.getName();
        if (SELF_SERVICE_ENDPOINTS.contains(key)) {
          seenSelfService.add(key);
          assertThat(invokesRequireUserToken(method, type.getName()))
              .as("自服务端点白名单项必须显式校验用户 access 令牌: %s", method.getFullName())
              .isTrue();
          continue;
        }
        assertThat(method.isAnnotatedWith(PreAuthorize.class))
            .as("业务端点必须声明 @PreAuthorize（仅显式审计的自服务端点可豁免）: %s", method.getFullName())
            .isTrue();
      }
    }
    assertThat(seenSelfService)
        .as("自服务端点白名单不得包含已删除或未映射的陈旧条目")
        .containsExactlyInAnyOrderElementsOf(SELF_SERVICE_ENDPOINTS);
  }

  private static boolean isWebEndpoint(JavaMethod method) {
    return MAPPING_ANNOTATIONS.stream().anyMatch(method::isAnnotatedWith);
  }

  private static boolean invokesRequireUserToken(JavaMethod root, String ownerClass) {
    Set<JavaCodeUnit> visited = new HashSet<>();
    Queue<JavaCodeUnit> queue = new ArrayDeque<>();
    queue.add(root);
    visited.add(root);
    while (!queue.isEmpty()) {
      JavaCodeUnit current = queue.poll();
      for (var call : current.getMethodCallsFromSelf()) {
        var target = call.getTarget();
        if (LiveAuthorizationService.class.getName().equals(target.getOwner().getName())
            && "requireUserToken".equals(target.getName())) {
          return true;
        }
        if (ownerClass.equals(target.getOwner().getName())) {
          target
              .resolveMember()
              .ifPresent(
                  member -> {
                    if (visited.add(member)) {
                      queue.add(member);
                    }
                  });
        }
      }
    }
    return false;
  }

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
