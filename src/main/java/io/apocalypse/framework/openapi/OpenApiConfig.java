package io.apocalypse.framework.openapi;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;

/** OpenAPI 装配：基本信息 + Bearer JWT 安全方案（全局生效，swagger-ui 可直接带令牌调试）。 */
@Configuration
public class OpenApiConfig {

  /** Bearer JWT security scheme 名称。 */
  private static final String JWT_SCHEME = "bearer-jwt";

  @Bean
  public OpenAPI apocalypseOpenAPI(
      @Value("${spring.application.version:0.0.1-SNAPSHOT}") String version) {
    return new OpenAPI()
        .info(new Info().title("Apocalypse API").version(version))
        .components(
            new Components()
                .addSecuritySchemes(
                    JWT_SCHEME,
                    new SecurityScheme()
                        .type(SecurityScheme.Type.HTTP)
                        .scheme("bearer")
                        .bearerFormat("JWT")))
        .addSecurityItem(new SecurityRequirement().addList(JWT_SCHEME));
  }
}
