package io.apocalypse.framework.openapi;

import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;
import java.util.function.UnaryOperator;

import org.springdoc.core.customizers.OpenApiCustomizer;

import io.swagger.v3.core.util.Json31;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.media.Content;
import io.swagger.v3.oas.models.media.Schema;

/** 在已生成的引用图上校准标量与nullable，不替代模型解析或HTTP序列化。 */
final class JsonSchemaContractCustomizer implements OpenApiCustomizer {

  private static final String REF_PREFIX = "#/components/schemas/";

  @Override
  @SuppressWarnings("rawtypes")
  public void customise(OpenAPI api) {
    Map<String, Schema> source = new LinkedHashMap<>(api.getComponents().getSchemas());
    Set<String> inputs = new HashSet<>();
    Set<String> outputs = new HashSet<>();
    visitOperations(
        api,
        schema -> {
          collectRefs(schema, source, inputs);
          return schema;
        },
        schema -> {
          collectRefs(schema, source, outputs);
          return schema;
        });
    Map<String, String> inputNames = new HashMap<>();
    for (String name : inputs) {
      if (outputs.contains(name) && containsLong(source.get(name), source, new HashSet<>())) {
        String copyName = name + "Input";
        if (source.containsKey(copyName)) {
          throw new IllegalStateException("OpenAPI input schema 名称冲突: " + copyName);
        }
        inputNames.put(name, copyName);
      }
    }
    Map<String, Schema> result = new LinkedHashMap<>();
    source.forEach(
        (name, schema) -> {
          boolean inputOnly = inputs.contains(name) && !outputs.contains(name);
          result.put(name, transform(copy(schema), inputOnly, inputNames));
          if (inputNames.containsKey(name)) {
            result.put(inputNames.get(name), transform(copy(schema), true, inputNames));
          }
        });
    api.getComponents().setSchemas(result);
    visitOperations(
        api,
        schema -> transform(copy(schema), true, inputNames),
        schema -> transform(copy(schema), false, inputNames));
    Set<String> operationIds = new HashSet<>();
    api.getPaths()
        .values()
        .forEach(
            path ->
                path.readOperations()
                    .forEach(
                        operation -> {
                          if (!operationIds.add(operation.getOperationId())) {
                            throw new IllegalStateException(
                                "OpenAPI operationId 重复，请显式声明: " + operation.getOperationId());
                          }
                        }));
  }

  private static void visitOperations(
      OpenAPI api, UnaryOperator<Schema<?>> input, UnaryOperator<Schema<?>> output) {
    api.getPaths()
        .values()
        .forEach(
            path -> {
              if (path.getParameters() != null) {
                path.getParameters()
                    .forEach(
                        parameter -> {
                          if (parameter.getSchema() != null) {
                            parameter.setSchema(input.apply(parameter.getSchema()));
                          }
                        });
              }
              path.readOperations()
                  .forEach(
                      operation -> {
                        if (operation.getParameters() != null) {
                          operation
                              .getParameters()
                              .forEach(
                                  parameter -> {
                                    if (parameter.getSchema() != null) {
                                      parameter.setSchema(input.apply(parameter.getSchema()));
                                    }
                                  });
                        }
                        if (operation.getRequestBody() != null) {
                          visitContent(operation.getRequestBody().getContent(), input);
                        }
                        if (operation.getResponses() != null) {
                          operation
                              .getResponses()
                              .values()
                              .forEach(
                                  response -> {
                                    visitContent(response.getContent(), output);
                                    if (response.getHeaders() != null) {
                                      response
                                          .getHeaders()
                                          .values()
                                          .forEach(
                                              header -> {
                                                if (header.getSchema() != null) {
                                                  header.setSchema(
                                                      output.apply(header.getSchema()));
                                                }
                                              });
                                    }
                                  });
                        }
                      });
            });
  }

  private static void visitContent(Content content, UnaryOperator<Schema<?>> action) {
    if (content != null) {
      content
          .values()
          .forEach(
              media -> {
                if (media.getSchema() != null) {
                  media.setSchema(action.apply(media.getSchema()));
                }
              });
    }
  }

  @SuppressWarnings("rawtypes")
  private static void collectRefs(
      Schema<?> schema, Map<String, Schema> definitions, Set<String> seen) {
    if (schema.get$ref() != null && schema.get$ref().startsWith(REF_PREFIX)) {
      String name = schema.get$ref().substring(REF_PREFIX.length());
      if (seen.add(name) && definitions.containsKey(name)) {
        collectRefs(definitions.get(name), definitions, seen);
      }
    }
    children(schema, child -> collectRefs(child, definitions, seen));
  }

  @SuppressWarnings("rawtypes")
  private static boolean containsLong(
      Schema<?> schema, Map<String, Schema> definitions, Set<String> seen) {
    if (markedLong(schema)) {
      return true;
    }
    if (schema.get$ref() != null && schema.get$ref().startsWith(REF_PREFIX)) {
      String name = schema.get$ref().substring(REF_PREFIX.length());
      if (seen.add(name)
          && definitions.containsKey(name)
          && containsLong(definitions.get(name), definitions, seen)) {
        return true;
      }
    }
    boolean[] found = {false};
    children(
        schema,
        child -> {
          if (containsLong(child, definitions, seen)) {
            found[0] = true;
          }
        });
    return found[0];
  }

  private static Schema<?> transform(
      Schema<?> schema, boolean input, Map<String, String> inputNames) {
    rewriteChildren(schema, child -> transform(child, input, inputNames));
    if (input && schema.get$ref() != null && schema.get$ref().startsWith(REF_PREFIX)) {
      String name = schema.get$ref().substring(REF_PREFIX.length());
      schema.set$ref(REF_PREFIX + inputNames.getOrDefault(name, name));
    }
    boolean nullable = schema.getTypes() != null && schema.getTypes().contains("null");
    if (nullable
        && (schema.getTypes().size() > 1 || schema.get$ref() != null || schema.getEnum() != null)) {
      Set<String> nonNull = new LinkedHashSet<>(schema.getTypes());
      nonNull.remove("null");
      schema.setTypes(nonNull.isEmpty() ? null : nonNull);
      schema.setType(null);
    } else {
      nullable = false;
    }
    Schema<?> resolved = schema;
    if (markedLong(schema)) {
      schema.getExtensions().remove(JsonScalarModelConverter.BOXED_LONG);
      if (schema.getExtensions().isEmpty()) {
        schema.setExtensions(null);
      }
      Schema<?> string = longString(schema);
      if (input) {
        resolved = new Schema<>().addAnyOfItem(string).addAnyOfItem(schema);
      } else {
        resolved = string;
      }
    }
    return nullable
        ? new Schema<>().addAnyOfItem(resolved).addAnyOfItem(new Schema<>().types(Set.of("null")))
        : resolved;
  }

  @SuppressWarnings("unchecked")
  private static Schema<?> longString(Schema<?> scalar) {
    // 保留标题、读写性、废弃标记及扩展等注解，只替换不适用于字符串的数值信息。
    Schema<Object> string = (Schema<Object>) copy(scalar);
    string.setType(null);
    string.setTypes(Set.of("string"));
    string.setFormat(null);
    string.setPattern(
        scalar.getMinimum() != null && scalar.getMinimum().signum() >= 0
            ? "^[0-9]+$"
            : "^-?[0-9]+$");
    string.setMinimum(null);
    string.setMaximum(null);
    string.setExclusiveMinimum(null);
    string.setExclusiveMaximum(null);
    string.setExclusiveMinimumValue(null);
    string.setExclusiveMaximumValue(null);
    string.setMultipleOf(null);
    if (scalar.getEnum() != null) {
      string.setEnum(
          scalar.getEnum().stream().map(JsonSchemaContractCustomizer::stringNumber).toList());
    }
    if (scalar.getDefaultSetFlag()) {
      string.setDefault(stringNumber(scalar.getDefault()));
    }
    if (scalar.getExampleSetFlag()) {
      string.setExample(stringNumber(scalar.getExample()));
    }
    if (scalar.getExamples() != null) {
      string.setExamples(
          scalar.getExamples().stream().map(JsonSchemaContractCustomizer::stringNumber).toList());
    }
    if (scalar.getConst() != null) {
      string.setConst(stringNumber(scalar.getConst()));
    }
    if (string.getDescription() == null) {
      string.setDescription("十进制Long字符串；转换后的64位范围及数值校验约束仍由服务端校验");
    }
    return string;
  }

  private static Object stringNumber(Object value) {
    return value instanceof Number ? value.toString() : value;
  }

  private static boolean markedLong(Schema<?> schema) {
    return schema.getExtensions() != null
        && Boolean.TRUE.equals(schema.getExtensions().get(JsonScalarModelConverter.BOXED_LONG));
  }

  private static Schema<?> copy(Schema<?> schema) {
    return Json31.mapper().convertValue(schema, Schema.class);
  }

  private static void rewriteChildren(Schema<?> schema, UnaryOperator<Schema<?>> action) {
    if (schema.getProperties() != null) {
      schema.getProperties().replaceAll((name, child) -> action.apply(child));
    }
    if (schema.getItems() != null) {
      schema.setItems(action.apply(schema.getItems()));
    }
    if (schema.getAdditionalProperties() instanceof Schema<?> child) {
      schema.setAdditionalProperties(action.apply(child));
    }
    if (schema.getAllOf() != null) {
      schema.getAllOf().replaceAll(child -> action.apply(child));
    }
    if (schema.getAnyOf() != null) {
      schema.getAnyOf().replaceAll(child -> action.apply(child));
    }
    if (schema.getOneOf() != null) {
      schema.getOneOf().replaceAll(child -> action.apply(child));
    }
  }

  private static void children(Schema<?> schema, Consumer<Schema<?>> action) {
    if (schema.getProperties() != null) {
      schema.getProperties().values().forEach(child -> action.accept(child));
    }
    if (schema.getItems() != null) {
      action.accept(schema.getItems());
    }
    if (schema.getAdditionalProperties() instanceof Schema<?> child) {
      action.accept(child);
    }
    for (var list :
        List.of(
            schema.getAllOf() == null ? List.<Schema<?>>of() : schema.getAllOf(),
            schema.getAnyOf() == null ? List.<Schema<?>>of() : schema.getAnyOf(),
            schema.getOneOf() == null ? List.<Schema<?>>of() : schema.getOneOf())) {
      list.forEach(child -> action.accept(child));
    }
  }
}
