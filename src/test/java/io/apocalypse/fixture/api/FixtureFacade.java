package io.apocalypse.fixture.api;

import io.apocalypse.fixture.application.FixtureRuntime;
import io.apocalypse.framework.capability.CapabilityRegistry;

import org.springframework.beans.factory.ObjectProvider;

public class FixtureFacade {
  public static final String KEY = "fixture";
  private final CapabilityRegistry capabilities;
  private final ObjectProvider<FixtureRuntime> runtime;

  public FixtureFacade(CapabilityRegistry capabilities, ObjectProvider<FixtureRuntime> runtime) {
    this.capabilities = capabilities;
    this.runtime = runtime;
  }

  public int status() {
    capabilities.requireEnabled(KEY, 11000, "测试能力已关闭");
    return runtime.getObject().status();
  }
}
