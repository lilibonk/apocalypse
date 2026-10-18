package io.apocalypse.system.authorization.service;

import io.apocalypse.framework.security.PermissionActionRegistry;
import io.apocalypse.system.authorization.dto.response.PermissionDeclarationResp;
import io.apocalypse.system.authorization.mapper.AuthorizationReadMapper;

import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.boot.sql.init.dependency.DependsOnDatabaseInitialization;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

/** Flyway 完成后只读核验代码身份和目录；不会覆盖管理员的状态或生命周期配置。 */
@Service
@DependsOnDatabaseInitialization
@RequiredArgsConstructor
public class PermissionCatalogValidation implements SmartInitializingSingleton {
  private final AuthorizationReadMapper mapper;

  private final PermissionActionRegistry registry;

  @Override
  public void afterSingletonsInstantiated() {
    Map<String, PermissionDeclarationResp> stored =
        mapper.declarations().stream()
            .collect(Collectors.toMap(PermissionDeclarationResp::code, Function.identity()));
    for (var action : registry.actions()) {
      PermissionDeclarationResp definition = stored.get(action.code());
      if (definition == null
          || !Objects.equals(definition.moduleKey(), action.moduleKey())
          || (action.legacy() != "LEGACY".equals(definition.lifecycle()))) {
        throw new IllegalStateException("权限目录与代码声明不一致: " + action.code());
      }
    }
    for (var definition : stored.values()) {
      if (!"LEGACY".equals(definition.lifecycle()) && !registry.isExecutable(definition.code())) {
        throw new IllegalStateException("未登记的可执行权限定义: " + definition.code());
      }
    }
  }
}
