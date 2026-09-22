package io.apocalypse;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** 默认关闭能力时，文档只校准现有操作，不能重新暴露可选模块。 */
class OpenApiDisabledCapabilityIT extends AbstractIntegrationTest {

  @Test
  void disabledCalendarRemainsAbsentAndSystemResponsesAreWrapped() {
    var docs = objectMapper.readTree(restTemplate.getForObject("/v3/api-docs", String.class));
    assertThat(docs.path("paths").propertyNames()).noneMatch(path -> path.startsWith("/calendar/"));
    var schema =
        docs.path("paths")
            .path("/system/users/page")
            .path("get")
            .at("/responses/200/content/application~1json/schema");
    assertThat(schema.path("properties").has("data")).isTrue();
    assertThat(schema.at("/properties/data/anyOf/0/$ref").asText()).endsWith("/PageResultUserResp");
  }
}
