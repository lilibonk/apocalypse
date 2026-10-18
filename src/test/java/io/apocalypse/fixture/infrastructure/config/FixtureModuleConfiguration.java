package io.apocalypse.fixture.infrastructure.config;

import io.apocalypse.fixture.api.FixtureFacade;
import io.apocalypse.framework.capability.CapabilityDefinition;
import io.apocalypse.framework.module.ModuleConfiguration;
import io.apocalypse.framework.security.PermissionActionDefinition;
import io.apocalypse.framework.security.PermissionActionRegistry.Action;

import java.util.List;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Profile;

/** Only present on the test classpath and activated by the explicit lifecycle fixture profile. */
@ModuleConfiguration
@Profile("optional-module-fixture")
@Import({FixtureFacade.class, FixtureRuntimeConfiguration.class})
public class FixtureModuleConfiguration {
  @Bean
  CapabilityDefinition fixtureCapabilityDefinition() {
    return new CapabilityDefinition(FixtureFacade.KEY);
  }

  @Bean
  PermissionActionDefinition fixturePermissionActions() {
    return new PermissionActionDefinition(
        List.of(Action.business("fixture:status:read", FixtureFacade.KEY, false)));
  }
}
