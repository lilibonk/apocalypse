package io.apocalypse.fixture.interfaces;

import io.apocalypse.fixture.api.FixtureFacade;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class FixtureController {
  private final FixtureFacade facade;

  public FixtureController(FixtureFacade facade) {
    this.facade = facade;
  }

  @GetMapping("/fixture/status")
  @PreAuthorize("hasAuthority('fixture:status:read')")
  public int status() {
    return facade.status();
  }
}
