package io.apocalypse;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpMethod;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

/** 真实 prod 配置下，关闭文档也必须关闭依赖中的默认静态资源映射。 */
@ActiveProfiles("prod")
class ProductionStaticResourcesIT extends AbstractIntegrationTest {

  @DynamicPropertySource
  static void isolatedProductionConfiguration(DynamicPropertyRegistry registry) {
    registry.add("DB_URL", POSTGRES::getJdbcUrl);
    registry.add("DB_USERNAME", POSTGRES::getUsername);
    registry.add("DB_PASSWORD", POSTGRES::getPassword);
    registry.add("REDIS_HOST", REDIS::getHost);
    registry.add("REDIS_PORT", () -> REDIS.getMappedPort(6379));
    registry.add("JWT_SECRET", () -> "test-only-production-resource-signing-key");
    registry.add("PUBLIC_ORIGIN", () -> "https://production.example.test");
    registry.add("apocalypse.security.bootstrap.admin-password", () -> ADMIN_PASSWORD);
  }

  @Test
  void productionClosesDocsAndKeepsAuthenticationRequired() {
    for (String path :
        new String[] {"/swagger-ui.html", "/swagger-ui/index.html", "/v3/api-docs"}) {
      assertThat(exchangeRaw(path, HttpMethod.GET, null, null).get("code").asInt())
          .as(path)
          .isEqualTo(40400);
    }
    assertThat(exchangeRaw("/system/users/me", HttpMethod.GET, null, null).get("code").asInt())
        .isEqualTo(40100);
  }

  @Test
  void authenticatedApiWorksButClasspathResourcesAndMissingRoutesRemainNotFound() {
    assertThat(new ClassPathResource("META-INF/resources/production-static-probe.txt").exists())
        .as("fixture must actually exist; a missing asset would not prove mappings are closed")
        .isTrue();
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);
    assertThat(getForData("/system/users/me", token).at("/user/username").asText())
        .isEqualTo("admin");
    for (String path :
        new String[] {
          "/production-static-probe.txt",
          "/webjars/swagger-ui/swagger-ui-bundle.js",
          "/missing-route"
        }) {
      assertThat(exchangeRaw(path, HttpMethod.GET, null, token).get("code").asInt())
          .as(path)
          .isEqualTo(40400);
    }
  }
}
