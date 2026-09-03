package io.apocalypse.calendar.application;

import io.apocalypse.calendar.api.CalendarErrorCode;
import io.apocalypse.framework.capability.CapabilityRegistry;

import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

/** Calendar 的固定 capability guard；facade 常驻时必须在访问持久层前调用。 */
@Component
@RequiredArgsConstructor
public class CalendarCapabilityGuard {

  private final CapabilityRegistry capabilityRegistry;

  public void requireEnabled() {
    CalendarErrorCode error = CalendarErrorCode.CALENDAR_DISABLED;
    capabilityRegistry.requireEnabled(
        CapabilityRegistry.CALENDAR, error.getCode(), error.getMessage());
  }
}
