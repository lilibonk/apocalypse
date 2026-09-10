package io.apocalypse.calendar.infrastructure.config;

import io.apocalypse.calendar.application.CalendarCapabilityGuard;
import io.apocalypse.calendar.application.GuardedCalendarProjectionApi;
import io.apocalypse.calendar.infrastructure.persistence.CalendarMapper;
import io.apocalypse.framework.capability.ConditionalOnCapability;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.context.TypeExcludeFilter;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.FilterType;

/** 所有 Calendar 运行组件与 Mapper 的唯一装配边界。 */
@Configuration(proxyBeanMethods = false)
@ConditionalOnCapability(CalendarCapabilityGuard.MODULE_KEY)
@ComponentScan(
    basePackages = "io.apocalypse.calendar",
    excludeFilters = {
      @ComponentScan.Filter(type = FilterType.ANNOTATION, classes = Configuration.class),
      @ComponentScan.Filter(
          type = FilterType.ASSIGNABLE_TYPE,
          classes = {CalendarCapabilityGuard.class, GuardedCalendarProjectionApi.class}),
      @ComponentScan.Filter(type = FilterType.CUSTOM, classes = TypeExcludeFilter.class)
    })
@MapperScan(basePackageClasses = CalendarMapper.class)
public class CalendarRuntimeConfiguration {}
