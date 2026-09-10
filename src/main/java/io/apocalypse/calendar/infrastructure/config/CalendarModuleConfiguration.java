package io.apocalypse.calendar.infrastructure.config;

import io.apocalypse.calendar.application.CalendarCapabilityGuard;
import io.apocalypse.calendar.application.GuardedCalendarProjectionApi;
import io.apocalypse.framework.capability.CapabilityDefinition;
import io.apocalypse.framework.module.ModuleConfiguration;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;

/** 常驻描述和拒绝入口；不得在此注入运行服务、Mapper 或专属配置。 */
@ModuleConfiguration
@Import({
  CalendarCapabilityGuard.class,
  GuardedCalendarProjectionApi.class,
  CalendarRuntimeConfiguration.class
})
public class CalendarModuleConfiguration {

  @Bean
  public CapabilityDefinition calendarCapabilityDefinition() {
    return new CapabilityDefinition(CalendarCapabilityGuard.MODULE_KEY);
  }
}
