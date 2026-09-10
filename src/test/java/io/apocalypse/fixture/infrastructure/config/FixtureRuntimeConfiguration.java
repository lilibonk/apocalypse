package io.apocalypse.fixture.infrastructure.config;

import io.apocalypse.fixture.api.FixtureFacade;
import io.apocalypse.fixture.infrastructure.persistence.FixtureMapper;
import io.apocalypse.framework.capability.ConditionalOnCapability;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.context.TypeExcludeFilter;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.FilterType;

@Configuration(proxyBeanMethods = false)
@ConditionalOnCapability(FixtureFacade.KEY)
@ComponentScan(
    basePackages = "io.apocalypse.fixture",
    excludeFilters = {
      @ComponentScan.Filter(type = FilterType.ANNOTATION, classes = Configuration.class),
      @ComponentScan.Filter(type = FilterType.CUSTOM, classes = TypeExcludeFilter.class)
    })
@MapperScan(basePackageClasses = FixtureMapper.class)
public class FixtureRuntimeConfiguration {}
