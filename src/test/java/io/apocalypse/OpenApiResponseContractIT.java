package io.apocalypse;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;

import static org.assertj.core.api.Assertions.assertThat;

import tools.jackson.databind.JsonNode;

/** 文档与实际 HTTP 同时验收，避免只对 customizer 自身结构做断言。 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "apocalypse.capabilities.calendar.enabled=true")
class OpenApiResponseContractIT extends AbstractIntegrationTest {

  @Test
  void pageAndObjectResponsesDocumentTheRuntimeEnvelope() {
    JsonNode docs = docs();
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);
    for (String path : List.of("/system/users/page", "/system/users/me")) {
      JsonNode schema = successSchema(docs, path, "get");
      JsonNode body = exchangeRaw(path, HttpMethod.GET, null, token);
      assertThat(schema.path("properties").propertyNames())
          .containsExactlyInAnyOrderElementsOf(body.propertyNames());
      assertThat(schema.at("/properties/timestamp/type").asText()).isEqualTo("integer");
      assertThat(body.path("timestamp").isIntegralNumber()).isTrue();
      assertThat(schema.at("/properties/data/anyOf/0/$ref").asText())
          .startsWith("#/components/schemas/");
      assertThat(schema.at("/properties/data/anyOf/1/type").asText()).isEqualTo("null");
    }
    JsonNode failure = exchangeRaw("/system/users/page?page=0", HttpMethod.GET, null, token);
    assertThat(failure.path("code").asInt()).isEqualTo(40000);
    assertThat(failure.path("data").isNull()).isTrue();
  }

  @Test
  void arrayResponsesKeepTheirElementSchemaInsideData() {
    JsonNode schema = successSchema(docs(), "/calendar/calendars", "get");
    assertThat(schema.at("/properties/data/anyOf/0/type").asText()).isEqualTo("array");
    assertThat(schema.at("/properties/data/anyOf/0/items/$ref").asText()).endsWith("/CalendarResp");
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);
    assertThat(getForData("/calendar/calendars", token).isArray()).isTrue();
  }

  @Test
  void voidDeletionHasAJsonEnvelopeWithNullData() {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);
    JsonNode created =
        postForData(
            "/system/users",
            Map.of(
                "username", "openapi-probe", "password", "ContractTest2026!", "nickname", "契约测试"),
            token);
    JsonNode body =
        exchangeRaw("/system/users/" + created.path("id").asText(), HttpMethod.DELETE, null, token);
    assertThat(body.path("code").asInt()).isZero();
    assertThat(body.path("data").isNull()).isTrue();
    JsonNode schema = successSchema(docs(), "/system/users/{id}", "delete");
    assertThat(schema.at("/properties/data/type").asText()).isEqualTo("null");
    assertThat(schema.path("properties").propertyNames())
        .containsExactlyInAnyOrderElementsOf(body.propertyNames());
  }

  @Test
  void explicitlyWrappedAuthResponseIsNotDoubleWrappedAndAllowsBusinessFailure() {
    JsonNode schema = successSchema(docs(), "/auth/login", "post");
    assertThat(schema.at("/anyOf/0/$ref").asText())
        .isEqualTo("#/components/schemas/RTokenResponse");
    assertThat(schema.at("/anyOf/1/properties/data/type").asText()).isEqualTo("null");
    JsonNode success =
        exchangeRaw(
            "/auth/login",
            HttpMethod.POST,
            Map.of("username", "admin", "password", ADMIN_PASSWORD),
            null);
    assertThat(success.at("/data/accessToken").asText()).isNotBlank();
    assertThat(success.at("/data/data").isMissingNode()).isTrue();
    JsonNode failure =
        exchangeRaw("/auth/login", HttpMethod.POST, Map.of("username", "", "password", ""), null);
    assertThat(failure.path("code").asInt()).isEqualTo(40000);
    assertThat(failure.path("data").isNull()).isTrue();
  }

  @Test
  void authenticationDocsDistinguishAnonymousEntriesAndNativeBearerRejection() {
    JsonNode docs = docs();
    for (String path : List.of("/auth/login", "/auth/refresh", "/auth/token")) {
      JsonNode security = docs.path("paths").path(path).path("post").path("security");
      assertThat(security.isArray()).isTrue();
      assertThat(security.size()).isZero();
    }
    assertThat(docs.path("security").get(0).has("bearer-jwt")).isTrue();
    assertThat(docs.path("paths").path("/system/users/me").path("get").has("security")).isFalse();
    JsonNode unauthorized = exchangeRaw("/system/users/me", HttpMethod.GET, null, null);
    assertThat(unauthorized.path("code").asInt()).isEqualTo(40100);
    HttpHeaders headers = new HttpHeaders();
    headers.setBearerAuth("invalid-contract-probe");
    var response =
        restTemplate.exchange(
            "/system/users/me", HttpMethod.GET, new HttpEntity<>(headers), String.class);
    assertThat(response.getStatusCode().value()).isEqualTo(401);
    assertThat(response.getBody()).isNullOrEmpty();
    assertThat(response.getHeaders().getFirst("WWW-Authenticate")).startsWith("Bearer");
    JsonNode nativeError =
        docs.path("paths").path("/system/users/me").path("get").path("responses").path("401");
    assertThat(nativeError.has("content")).isFalse();
    assertThat(nativeError.at("/headers/WWW-Authenticate/schema/type").asText())
        .isEqualTo("string");
  }

  @Test
  void binaryResponseEntityIsNotWrappedInDocumentationOrOnTheWire() {
    String path = "/calendar/data-imports/template";
    JsonNode responseSchema =
        docs().path("paths").path(path).path("get").at("/responses/200/content/text~1csv/schema");
    assertThat(responseSchema.path("type").asText()).isEqualTo("string");
    assertThat(responseSchema.has("properties")).isFalse();
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);
    HttpHeaders headers = new HttpHeaders();
    headers.setBearerAuth(token);
    headers.setAccept(List.of(MediaType.parseMediaType("text/csv"), MediaType.APPLICATION_JSON));
    var response =
        restTemplate.exchange(
            path + "?targetType=SYSTEM_BASELINE&year=2026",
            HttpMethod.GET,
            new HttpEntity<>(headers),
            byte[].class);
    assertThat(response.getStatusCode().value()).isEqualTo(200);
    assertThat(response.getHeaders().getContentType().toString()).startsWith("text/csv");
    assertThat(response.getHeaders().getFirst("Content-Disposition")).contains("attachment");
    assertThat(response.getBody()).isNotEmpty();
    JsonNode errorSchema =
        docs()
            .path("paths")
            .path("/calendar/data-imports/{id}/files/data")
            .path("get")
            .at("/responses/200/content/application~1json/schema");
    assertThat(errorSchema.at("/properties/data/type").asText()).isEqualTo("null");
    headers.setAccept(List.of(MediaType.APPLICATION_OCTET_STREAM, MediaType.APPLICATION_JSON));
    var missing =
        restTemplate.exchange(
            "/calendar/data-imports/999999999999999999/files/data",
            HttpMethod.GET,
            new HttpEntity<>(headers),
            String.class);
    assertThat(missing.getStatusCode().value()).isEqualTo(200);
    assertThat(missing.getHeaders().getContentType().isCompatibleWith(MediaType.APPLICATION_JSON))
        .isTrue();
    assertThat(objectMapper.readTree(missing.getBody()).path("code").asInt()).isEqualTo(40400);
  }

  @Test
  void eventRequestsAcceptExplicitNullsAndBothIdFormsWithoutChangingDateSerialization() {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);
    for (boolean timed : List.of(false, true)) {
      Map<String, Object> content = new LinkedHashMap<>();
      content.put("title", "字段契约测试");
      content.put("description", null);
      content.put("location", null);
      content.put("timeKind", timed ? "TIMED" : "ALL_DAY");
      content.put("startDate", timed ? null : "2026-09-10");
      content.put("endDateExclusive", timed ? null : "2026-09-11");
      content.put("startLocal", timed ? "2026-09-10 10:00:00" : null);
      content.put("endLocal", timed ? "2026-09-10 11:00:00" : null);
      content.put("zoneId", timed ? "Asia/Shanghai" : null);
      content.put("startOffsetChoice", null);
      content.put("endOffsetChoice", null);
      JsonNode created =
          postForData(
              "/calendar/events", Map.of("calendarId", timed ? 1 : "1", "content", content), token);
      assertThat(created.path("id").isString()).isTrue();
      assertThat(Long.parseLong(created.path("id").asText())).isGreaterThan(9007199254740991L);
      assertThat(created.path("version").isIntegralNumber()).isTrue();
      assertThat(created.at("/content/description").isNull()).isTrue();
      assertThat(created.at("/content/" + (timed ? "startDate" : "startLocal")).isNull()).isTrue();
      assertThat(created.at("/content/" + (timed ? "startLocal" : "startDate")).asText())
          .isEqualTo(timed ? "2026-09-10 10:00:00" : "2026-09-10");
    }
    JsonNode input = docs().at("/components/schemas/EventContentReq/properties");
    for (String field : List.of("startDate", "startLocal", "zoneId", "startOffsetChoice")) {
      assertThat(input.path(field).at("/anyOf/1/type").asText()).isEqualTo("null");
    }
  }

  @Test
  void outputIdsAreStringsWhilePageCountsAndRequiredInputsKeepTheirConstraints() {
    JsonNode schemas = docs().at("/components/schemas");
    assertThat(schemas.at("/UserResp/properties/id/type").asText()).isEqualTo("string");
    assertThat(schemas.at("/PageResultUserResp/properties/total/type").asText())
        .isEqualTo("integer");
    assertThat(schemas.at("/CalendarCreateReq/required").toString()).contains("parentId");
    assertThat(schemas.at("/CalendarCreateReq/properties/parentId/anyOf/0/type").asText())
        .isEqualTo("string");
    assertThat(schemas.at("/CalendarCreateReq/properties/parentId/anyOf/1/type").asText())
        .isEqualTo("integer");
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);
    JsonNode day = getForData("/calendar/days/2026-09-10?calendarId=1", token);
    assertThat(day.at("/resolutions/0/underlay").isNull()).isTrue();
    assertThat(day.at("/resolutions/0/underlayHash").isNull()).isTrue();
    assertThat(schemas.at("/FieldResolutionResp/properties/underlay/anyOf/1/type").asText())
        .isEqualTo("null");
    assertThat(schemas.at("/FieldResolutionResp/properties/underlayHash/anyOf/1/type").asText())
        .isEqualTo("null");
  }

  private JsonNode docs() {
    JsonNode result =
        objectMapper.readTree(restTemplate.getForObject("/v3/api-docs", String.class));
    assertThat(result.path("openapi").asText()).isEqualTo("3.1.0");
    return result;
  }

  private static JsonNode successSchema(JsonNode docs, String path, String method) {
    JsonNode content = docs.path("paths").path(path).path(method).at("/responses/200/content");
    assertThat(content.propertyNames()).containsExactly("application/json");
    return content.path("application/json").path("schema");
  }
}
