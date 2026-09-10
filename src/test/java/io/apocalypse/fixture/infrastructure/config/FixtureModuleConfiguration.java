package io.apocalypse.fixture.infrastructure.config;

import io.apocalypse.fixture.api.FixtureFacade;
import io.apocalypse.framework.capability.CapabilityDefinition;
import io.apocalypse.framework.module.ModuleConfiguration;

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
}
