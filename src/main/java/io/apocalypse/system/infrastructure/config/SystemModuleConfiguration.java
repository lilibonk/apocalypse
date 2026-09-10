package io.apocalypse.system.infrastructure.config;

import io.apocalypse.framework.module.ModuleConfiguration;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.context.TypeExcludeFilter;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.FilterType;

/** 核心模块始终装配；生成的 MapStruct 组件仍由模块内扫描发现。 */
@ModuleConfiguration
@ComponentScan(
    basePackages = "io.apocalypse.system",
    excludeFilters = {
      @ComponentScan.Filter(type = FilterType.ANNOTATION, classes = Configuration.class),
      @ComponentScan.Filter(type = FilterType.CUSTOM, classes = TypeExcludeFilter.class)
    })
@MapperScan("io.apocalypse.system.**.mapper")
public class SystemModuleConfiguration {}
