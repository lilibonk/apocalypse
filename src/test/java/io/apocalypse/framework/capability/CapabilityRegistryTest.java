package io.apocalypse.framework.capability;

import io.apocalypse.common.exception.BizException;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CapabilityRegistryTest {

  @Test
  void coreAndKnownDefaultOffButUnknownConfigurationCannotRegisterAModule() {
    CapabilityRegistry registry =
        new CapabilityRegistry(
            List.of(new CapabilityDefinition("calendar")),
            new MockEnvironment().withProperty("apocalypse.capabilities.unknown.enabled", "true"));
    assertThat(registry.isEnabled(null)).isTrue();
    assertThat(registry.isEnabled(" ")).isTrue();
    assertThat(registry.isEnabled("unknown")).isFalse();
    assertThat(registry.isEnabled("calendar")).isFalse();
    assertThat(registry.isEnabled(" calendar ")).isFalse();
    assertThat(registry.cacheDiscriminator()).isEqualTo("caps:v1;calendar=0");
    assertThatThrownBy(() -> registry.requireEnabled("calendar", 11000, "万年历能力未启用"))
        .isInstanceOfSatisfying(
            BizException.class,
            error -> {
              assertThat(error.getCode()).isEqualTo(11000);
              assertThat(error.getMessage()).isEqualTo("万年历能力未启用");
            });
  }

  @Test
  void allStatesSortedAndFrozenAtStartup() {
    MockEnvironment environment =
        new MockEnvironment().withProperty("apocalypse.capabilities.calendar.enabled", "true");
    var calendar = new CapabilityDefinition("calendar");
    var second = new CapabilityDefinition("second");
    var registry = new CapabilityRegistry(List.of(second, calendar), environment);
    assertThat(registry.cacheDiscriminator()).isEqualTo("caps:v1;calendar=1;second=0");
    assertThat(new CapabilityRegistry(List.of(calendar, second), environment).cacheDiscriminator())
        .isEqualTo(registry.cacheDiscriminator());
    environment.setProperty("apocalypse.capabilities.calendar.enabled", "false");
    assertThat(registry.isEnabled("calendar")).isTrue();
    assertThat(new CapabilityRegistry(List.of(calendar, second), environment).cacheDiscriminator())
        .isNotEqualTo(registry.cacheDiscriminator());
  }

  @Test
  void duplicateInvalidDefinitionsAndInvalidSwitchFailFast() {
    var definition = new CapabilityDefinition("calendar");
    assertThatThrownBy(
            () -> new CapabilityRegistry(List.of(definition, definition), new MockEnvironment()))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("重复");
    for (String invalid : List.of("", "Calendar", "bad;key", "bad.key", " calendar")) {
      assertThatThrownBy(() -> new CapabilityDefinition(invalid))
          .isInstanceOf(IllegalArgumentException.class);
    }
    assertThatThrownBy(() -> new CapabilityDefinition(null))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(
            () ->
                new CapabilityRegistry(
                    List.of(definition),
                    new MockEnvironment()
                        .withProperty("apocalypse.capabilities.calendar.enabled", "invalid")))
        .isInstanceOf(org.springframework.boot.context.properties.bind.BindException.class);
  }

  @Test
  void registryAndConditionUseTheSameBooleanBinding() {
    for (String value : List.of("true", "false", "on", "off", "yes", "no", "1", "0")) {
      var environment =
          new MockEnvironment().withProperty("apocalypse.capabilities.calendar.enabled", value);
      var registry =
          new CapabilityRegistry(List.of(new CapabilityDefinition("calendar")), environment);
      assertThat(registry.isEnabled("calendar"))
          .isEqualTo(CapabilitySwitch.isEnabled(environment, "calendar"));
    }
  }
}
