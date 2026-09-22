package io.apocalypse.framework.openapi;

import io.apocalypse.common.response.R;
import io.apocalypse.framework.security.AuthController;

import java.util.List;
import java.util.Set;

import org.springdoc.core.customizers.OperationCustomizer;
import org.springframework.core.ResolvableType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.method.HandlerMethod;

import io.swagger.v3.oas.models.Operation;
import io.swagger.v3.oas.models.headers.Header;
import io.swagger.v3.oas.models.media.ComposedSchema;
import io.swagger.v3.oas.models.media.Content;
import io.swagger.v3.oas.models.media.IntegerSchema;
import io.swagger.v3.oas.models.media.MediaType;
import io.swagger.v3.oas.models.media.ObjectSchema;
import io.swagger.v3.oas.models.media.Schema;
import io.swagger.v3.oas.models.media.StringSchema;
import io.swagger.v3.oas.models.responses.ApiResponse;

/** 描述现有 ResponseWrapperAdvice 与安全过滤器的 wire 行为，不参与运行时响应处理。 */
final class ResponseContractCustomizer implements OperationCustomizer {

  private static final String JSON = "application/json";

  private static final Set<String> ANONYMOUS_AUTH_METHODS = Set.of("login", "refresh", "token");

  @Override
  public Operation customize(Operation operation, HandlerMethod handler) {
    if (!handler.getBeanType().getPackageName().startsWith("io.apocalypse.")) {
      return operation;
    }
    var declared = handler.getMethodAnnotation(io.swagger.v3.oas.annotations.Operation.class);
    if (declared == null || declared.operationId().isBlank()) {
      operation.setOperationId(
          handler.getBeanType().getName().substring("io.apocalypse.".length()).replace('.', '_')
              + "_"
              + handler.getMethod().getName());
    }
    if (AuthController.class.isAssignableFrom(handler.getBeanType())
        && ANONYMOUS_AUTH_METHODS.contains(handler.getMethod().getName())) {
      operation.setSecurity(List.of());
    }
    operation
        .getResponses()
        .addApiResponse(
            "401",
            new ApiResponse()
                .description("Bearer JWT 无效时由安全过滤器返回 HTTP 401，无 R 响应体")
                .addHeaderObject("WWW-Authenticate", new Header().schema(new StringSchema())));

    Class<?> returnType = handler.getReturnType().getParameterType();
    ApiResponse response = operation.getResponses().get("200");
    if (response == null) {
      return operation;
    }
    if (ResponseEntity.class.isAssignableFrom(returnType)) {
      if (ResolvableType.forMethodParameter(handler.getReturnType()).getGeneric(0).resolve()
              == byte[].class
          && response.getContent() != null) {
        response.getContent().addMediaType(JSON, new MediaType().schema(envelope(nullValue())));
      }
      return operation;
    }
    Schema<?> original = null;
    if (response.getContent() != null && !response.getContent().isEmpty()) {
      MediaType media = response.getContent().get(JSON);
      if (media == null) {
        media = response.getContent().values().iterator().next();
      }
      original = media.getSchema();
    }
    Schema<?> schema;
    if (R.class.isAssignableFrom(returnType)) {
      // 已经是 R 的接口不能再包装；错误时 data=null，与成功数据 schema 并列。
      schema =
          original == null
              ? envelope(new Schema<>())
              : new ComposedSchema().addAnyOfItem(original).addAnyOfItem(envelope(nullValue()));
    } else {
      Schema<?> data =
          returnType == void.class || returnType == Void.class
              ? nullValue()
              : new ComposedSchema()
                  .addAnyOfItem(original == null ? new Schema<>() : original)
                  .addAnyOfItem(nullValue());
      schema = envelope(data);
    }
    response
        .description(
            "HTTP 200 使用 R 响应；code=0 成功，非零为业务错误且 data=null。"
                + "缺失凭证为 code=40100，权限不足为 code=40300；无效 Bearer JWT 另见 HTTP 401。")
        .content(new Content().addMediaType(JSON, new MediaType().schema(schema)));
    return operation;
  }

  private static Schema<?> envelope(Schema<?> data) {
    return new ObjectSchema()
        .addProperty("code", new IntegerSchema().description("0 成功，非零为业务错误码"))
        .addProperty("message", new StringSchema())
        .addProperty("data", data)
        .addProperty("traceId", new StringSchema())
        .addProperty("timestamp", new IntegerSchema().format("int64"))
        .required(List.of("code", "message", "data", "traceId", "timestamp"));
  }

  private static Schema<?> nullValue() {
    return new Schema<>().types(Set.of("null"));
  }
}
