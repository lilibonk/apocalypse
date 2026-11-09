package io.apocalypse.system.infrastructure.config;

import io.apocalypse.framework.module.ModuleConfiguration;
import io.apocalypse.framework.redis.RedisCacheTypeRegistration;
import io.apocalypse.framework.security.PermissionActionDefinition;
import io.apocalypse.system.authorization.service.SystemPermissionActions;
import io.apocalypse.system.dict.dto.response.DictDataResp;
import io.apocalypse.system.log.dto.response.LoginHeatmapResp;
import io.apocalypse.system.log.dto.response.LoginInsightResp;
import io.apocalypse.system.user.dto.response.UserResp;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.context.TypeExcludeFilter;
import org.springframework.context.annotation.Bean;
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
public class SystemModuleConfiguration {
  @Bean
  public PermissionActionDefinition systemPermissionActionDefinition() {
    return SystemPermissionActions.definition();
  }

  @Bean
  public RedisCacheTypeRegistration systemRedisCacheTypeRegistration() {
    return RedisCacheTypeRegistration.builder()
        .single("user-response", UserResp.class)
        .list("dict-data-list", DictDataResp.class)
        .single("login-insight", LoginInsightResp.class)
        .single("login-heatmap", LoginHeatmapResp.class)
        .build();
  }
}
