package io.apocalypse.system.authorization.service;

import io.apocalypse.framework.security.PermissionActionDefinition;
import io.apocalypse.framework.security.PermissionActionRegistry;
import io.apocalypse.system.authorization.dto.response.PermissionDeclarationResp;
import io.apocalypse.system.authorization.mapper.AuthorizationReadMapper;

import java.util.List;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class PermissionCatalogValidationTest {
  @Test
  void missingWrongModuleOrExecutableLegacyDeclarationPreventsStartup() {
    var mapper = mock(AuthorizationReadMapper.class);
    var registry =
        new PermissionActionRegistry(
            List.of(
                new PermissionActionDefinition(
                    List.of(
                        PermissionActionRegistry.Action.business(
                            "calendar:event:list", "calendar", false)))));
    var validation = new PermissionCatalogValidation(mapper, registry);
    for (var entries :
        List.of(
            List.<PermissionDeclarationResp>of(),
            List.of(new PermissionDeclarationResp("calendar:event:list", null, "ACTIVE")),
            List.of(new PermissionDeclarationResp("calendar:event:list", "calendar", "LEGACY")))) {
      when(mapper.declarations()).thenReturn(entries);
      assertThatThrownBy(validation::afterSingletonsInstantiated)
          .isInstanceOf(IllegalStateException.class);
    }
    when(mapper.declarations())
        .thenReturn(
            List.of(
                new PermissionDeclarationResp("calendar:event:list", "calendar", "DEPRECATED"),
                new PermissionDeclarationResp("historical:custom", null, "LEGACY")));
    assertThatCode(validation::afterSingletonsInstantiated).doesNotThrowAnyException();
  }
}
