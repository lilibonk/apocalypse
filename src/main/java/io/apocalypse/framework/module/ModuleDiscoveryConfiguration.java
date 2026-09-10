package io.apocalypse.framework.module;

import org.springframework.boot.context.TypeExcludeFilter;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.FilterType;

/** 只发现模块入口，不让业务 stereotype 绕过模块开关。 */
@Configuration(proxyBeanMethods = false)
@ComponentScan(
    basePackages = "io.apocalypse",
    useDefaultFilters = false,
    includeFilters =
        @ComponentScan.Filter(type = FilterType.ANNOTATION, classes = ModuleConfiguration.class),
    excludeFilters =
        @ComponentScan.Filter(type = FilterType.CUSTOM, classes = TypeExcludeFilter.class))
public class ModuleDiscoveryConfiguration {}
