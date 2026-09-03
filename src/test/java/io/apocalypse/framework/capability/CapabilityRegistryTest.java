package io.apocalypse.framework.capability;

import io.apocalypse.common.exception.BizException;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CapabilityRegistryTest {

  @Test
  void coreIsEnabledAndUnknownModuleFailsClosed() {
    CapabilityProperties properties = new CapabilityProperties();
    CapabilityRegistry registry = new CapabilityRegistry(properties);

    assertThat(registry.isEnabled(null)).isTrue();
    assertThat(registry.isEnabled(" ")).isTrue();
    assertThat(registry.isEnabled("unknown-module")).isFalse();
    assertThat(registry.isEnabled(CapabilityRegistry.CALENDAR)).isFalse();
    assertThat(registry.cacheDiscriminator()).isEqualTo("calendar=false");
  }

  @Test
  void calendarCanBeEnabledAndGuardUsesStableBusinessError() {
    CapabilityProperties properties = new CapabilityProperties();
    CapabilityRegistry registry = new CapabilityRegistry(properties);

    assertThatThrownBy(() -> registry.requireEnabled("calendar", 11000, "万年历能力未启用"))
        .isInstanceOfSatisfying(
            BizException.class,
            error -> {
              assertThat(error.getCode()).isEqualTo(11000);
              assertThat(error.getMessage()).isEqualTo("万年历能力未启用");
            });

    properties.getCalendar().setEnabled(true);
    assertThat(registry.isEnabled(CapabilityRegistry.CALENDAR)).isTrue();
    assertThat(registry.cacheDiscriminator()).isEqualTo("calendar=true");
  }
}
