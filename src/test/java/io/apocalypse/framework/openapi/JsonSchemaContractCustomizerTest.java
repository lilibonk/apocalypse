package io.apocalypse.framework.openapi;

import io.apocalypse.framework.web.JacksonConfig;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

import io.swagger.v3.core.converter.AnnotatedType;
import io.swagger.v3.core.converter.ModelConverters;
import io.swagger.v3.core.util.Json31;
import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.Operation;
import io.swagger.v3.oas.models.PathItem;
import io.swagger.v3.oas.models.Paths;
import io.swagger.v3.oas.models.media.Content;
import io.swagger.v3.oas.models.media.MediaType;
import io.swagger.v3.oas.models.media.Schema;
import io.swagger.v3.oas.models.parameters.RequestBody;
import io.swagger.v3.oas.models.responses.ApiResponse;
import io.swagger.v3.oas.models.responses.ApiResponses;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

class JsonSchemaContractCustomizerTest {
  enum Choice {
    A,
    B
  }

  record Nested(String value) {}

  record Shared(
      Long id,
      long total,
      List<Long> ids,
      Map<String, Long> counts,
      LocalDateTime local,
      Instant instant,
      @NotNull @Min(0) Long parentId,
      @io.swagger.v3.oas.annotations.media.Schema(nullable = true) Nested nested,
      @io.swagger.v3.oas.annotations.media.Schema(nullable = true) Choice choice) {}

  record Recursive(Long id, Recursive child) {}

  record AnnotatedIds(
      @Min(0)
          @io.swagger.v3.oas.annotations.media.Schema(
              title = "公开标识",
              description = "保留完整精度",
              accessMode = io.swagger.v3.oas.annotations.media.Schema.AccessMode.READ_ONLY,
              deprecated = true,
              allowableValues = {"42", "9007199254740993"},
              defaultValue = "42",
              examples = {"42", "9007199254740993"},
              extensions =
                  @io.swagger.v3.oas.annotations.extensions.Extension(
                      name = "x-contract",
                      properties =
                          @io.swagger.v3.oas.annotations.extensions.ExtensionProperty(
                              name = "owner",
                              value = "fixture")))
          Long id,
      @io.swagger.v3.oas.annotations.media.Schema(
              accessMode = io.swagger.v3.oas.annotations.media.Schema.AccessMode.WRITE_ONLY)
          Long inputId) {}

  @Test
  void scalarAnnotationsSurviveAndNumericMetadataMatchesEachWireType() {
    JsonNode docs = convert(AnnotatedIds.class, true);
    JsonNode output = docs.at("/components/schemas/AnnotatedIds/properties/id");
    JsonNode stringInput = docs.at("/components/schemas/AnnotatedIdsInput/properties/id/anyOf/0");
    JsonNode numericInput = docs.at("/components/schemas/AnnotatedIdsInput/properties/id/anyOf/1");
    for (JsonNode string : List.of(output, stringInput)) {
      assertThat(string.path("type").asText()).isEqualTo("string");
      assertThat(string.path("title").asText()).isEqualTo("公开标识");
      assertThat(string.path("description").asText()).isEqualTo("保留完整精度");
      assertThat(string.path("readOnly").asBoolean()).isTrue();
      assertThat(string.path("deprecated").asBoolean()).isTrue();
      assertThat(string.at("/x-contract/owner").asText()).isEqualTo("fixture");
      assertThat(string.at("/enum/0").isString()).isTrue();
      assertThat(string.at("/enum/1").asText()).isEqualTo("9007199254740993");
      assertThat(string.path("default").isString()).isTrue();
      assertThat(string.path("default").asText()).isEqualTo("42");
      assertThat(string.at("/examples/1").isString()).isTrue();
      assertThat(string.at("/examples/1").asText()).isEqualTo("9007199254740993");
      assertThat(string.path("format").isMissingNode()).isTrue();
      assertThat(string.path("minimum").isMissingNode()).isTrue();
    }
    assertThat(numericInput.path("type").asText()).isEqualTo("integer");
    assertThat(numericInput.path("minimum").asInt(-1)).isZero();
    assertThat(numericInput.at("/enum/1").asText()).isEqualTo("9007199254740993");
    assertThat(numericInput.path("default").isIntegralNumber()).isTrue();
    assertThat(docs.at("/components/schemas/AnnotatedIds/properties/inputId/writeOnly").asBoolean())
        .isTrue();
    assertThat(docs.toString()).doesNotContain(JsonScalarModelConverter.BOXED_LONG);
  }

  @Test
  void numericExamplesAndConstAreStringsOnlyInTheStringBranch() {
    Schema<Object> scalar = new Schema<>().types(Set.of("integer")).format("int64");
    scalar.addExtension(JsonScalarModelConverter.BOXED_LONG, true);
    scalar.setExample(9007199254740993L);
    scalar.setConst(9007199254740993L);
    scalar.setMaximum(BigDecimal.valueOf(Long.MAX_VALUE));
    scalar.setExclusiveMinimumValue(BigDecimal.ZERO);
    scalar.setMultipleOf(BigDecimal.ONE);
    JsonNode docs =
        customise(
            Map.of("Fixture", new Schema<>().types(Set.of("object")).addProperty("id", scalar)),
            "#/components/schemas/Fixture",
            true);
    JsonNode output = docs.at("/components/schemas/Fixture/properties/id");
    JsonNode input = docs.at("/components/schemas/FixtureInput/properties/id/anyOf/1");
    assertThat(output.path("example").isString()).isTrue();
    assertThat(output.path("example").asText()).isEqualTo("9007199254740993");
    assertThat(output.path("const").isString()).isTrue();
    assertThat(output.path("const").asText()).isEqualTo("9007199254740993");
    assertThat(output.path("maximum").isMissingNode()).isTrue();
    assertThat(output.path("exclusiveMinimum").isMissingNode()).isTrue();
    assertThat(output.path("multipleOf").isMissingNode()).isTrue();
    assertThat(input.path("example").isIntegralNumber()).isTrue();
    assertThat(input.path("const").isIntegralNumber()).isTrue();
    assertThat(input.path("maximum").asLong()).isEqualTo(Long.MAX_VALUE);
    assertThat(input.path("exclusiveMinimum").asInt(-1)).isZero();
    assertThat(input.path("multipleOf").asInt()).isEqualTo(1);
  }

  @Test
  void sharedModelSeparatesInputsAndPreservesTheRealSerializerTypes() {
    JsonNode docs = convert(Shared.class, true);
    JsonNode output = docs.at("/components/schemas/Shared/properties");
    JsonNode input = docs.at("/components/schemas/SharedInput/properties");
    assertThat(output.at("/id/type").asText()).isEqualTo("string");
    assertThat(input.at("/id/anyOf/0/type").asText()).isEqualTo("string");
    assertThat(input.at("/id/anyOf/1/type").asText()).isEqualTo("integer");
    assertThat(output.at("/total/type").asText()).isEqualTo("integer");
    assertThat(input.at("/total/type").asText()).isEqualTo("integer");
    assertThat(output.at("/ids/items/type").asText()).isEqualTo("string");
    assertThat(output.at("/counts/additionalProperties/type").asText()).isEqualTo("string");
    assertThat(input.at("/parentId/anyOf/1/minimum").asInt(-1)).isZero();
    assertThat(docs.at("/components/schemas/SharedInput/required/0").asText())
        .isEqualTo("parentId");
    assertThat(docs.toString()).doesNotContain(JsonScalarModelConverter.BOXED_LONG);
    var builder = JsonMapper.builder();
    new JacksonConfig().apocalypseJacksonCustomizer().customize(builder);
    ObjectMapper mapper = builder.build();
    var value =
        new Shared(
            9007199254740993L,
            9L,
            List.of(9007199254740993L),
            Map.of("count", 4L),
            LocalDateTime.of(2026, 9, 22, 14, 30),
            Instant.parse("2026-09-22T06:30:00Z"),
            0L,
            null,
            null);
    JsonNode wire = mapper.readTree(mapper.writeValueAsString(value));
    assertThat(wire.path("id").asText()).isEqualTo("9007199254740993");
    assertThat(wire.at("/ids/0").isString()).isTrue();
    assertThat(wire.at("/counts/count").isString()).isTrue();
    assertThat(wire.path("total").isIntegralNumber()).isTrue();
    assertThat(wire.path("local").asText()).matches(output.at("/local/pattern").asText());
    assertThat(output.at("/local/format").isMissingNode()).isTrue();
    assertThat(output.at("/instant/format").asText()).isEqualTo("date-time");
  }

  @Test
  void nullableReferencesAndEnumsActuallyAllowNull() {
    JsonNode properties = convert(Shared.class, true).at("/components/schemas/Shared/properties");
    assertThat(properties.at("/nested/anyOf/0/$ref").asText()).endsWith("/Nested");
    assertThat(properties.at("/nested/anyOf/0/type").isMissingNode()).isTrue();
    assertThat(properties.at("/nested/anyOf/1/type").asText()).isEqualTo("null");
    assertThat(properties.at("/choice/anyOf/0/type").asText()).isEqualTo("string");
    assertThat(properties.at("/choice/anyOf/0/enum/0").asText()).isEqualTo("A");
    assertThat(properties.at("/choice/anyOf/1/type").asText()).isEqualTo("null");
  }

  @Test
  void recursiveSharedGraphTerminatesAndUsesDirectionalReferences() {
    JsonNode docs = convert(Recursive.class, true);
    assertThat(docs.at("/components/schemas/Recursive/properties/child/$ref").asText())
        .endsWith("/Recursive");
    assertThat(docs.at("/components/schemas/RecursiveInput/properties/child/$ref").asText())
        .endsWith("/RecursiveInput");
    assertThat(
            docs.at("/paths/~1fixture/post/requestBody/content/application~1json/schema/$ref")
                .asText())
        .endsWith("/RecursiveInput");
  }

  @Test
  void inputOnlyModelKeepsItsNameAndConstraints() {
    JsonNode docs = convert(Shared.class, false);
    assertThat(docs.at("/components/schemas/SharedInput").isMissingNode()).isTrue();
    assertThat(docs.at("/components/schemas/Shared/properties/parentId/anyOf/1/minimum").asInt(-1))
        .isZero();
  }

  private static JsonNode convert(Class<?> type, boolean shared) {
    var converters = new ModelConverters(true);
    converters.addConverter(new JsonScalarModelConverter());
    var resolved = converters.resolveAsResolvedSchema(new AnnotatedType(type).resolveAsRef(true));
    return customise(resolved.referencedSchemas, resolved.schema.get$ref(), shared);
  }

  @SuppressWarnings("rawtypes")
  private static JsonNode customise(Map<String, Schema> definitions, String ref, boolean shared) {
    Content input =
        new Content()
            .addMediaType("application/json", new MediaType().schema(new Schema<>().$ref(ref)));
    Content output =
        new Content()
            .addMediaType(
                "application/json",
                new MediaType()
                    .schema(shared ? new Schema<>().$ref(ref) : new Schema<>().type("string")));
    OpenAPI api =
        new OpenAPI()
            .components(new Components().schemas(definitions))
            .paths(
                new Paths()
                    .addPathItem(
                        "/fixture",
                        new PathItem()
                            .post(
                                new Operation()
                                    .operationId("fixture")
                                    .requestBody(new RequestBody().content(input))
                                    .responses(
                                        new ApiResponses()
                                            .addApiResponse(
                                                "200", new ApiResponse().content(output))))));
    new JsonSchemaContractCustomizer().customise(api);
    return new ObjectMapper().readTree(Json31.pretty(api));
  }
}
