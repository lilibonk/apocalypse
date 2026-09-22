package io.apocalypse.framework.openapi;

import java.time.LocalDateTime;
import java.util.Iterator;

import io.swagger.v3.core.converter.AnnotatedType;
import io.swagger.v3.core.converter.ModelConverter;
import io.swagger.v3.core.converter.ModelConverterContext;
import io.swagger.v3.core.util.Json31;
import io.swagger.v3.oas.models.media.Schema;

/** 保留生成器的校验约束，用临时类型标记区分 boxed Long 与 primitive long。 */
final class JsonScalarModelConverter implements ModelConverter {

  static final String BOXED_LONG = "x-apocalypse-boxed-long";

  @Override
  public Schema<?> resolve(
      AnnotatedType type, ModelConverterContext context, Iterator<ModelConverter> chain) {
    Schema<?> schema = chain.hasNext() ? chain.next().resolve(type, context, chain) : null;
    if (schema == null || type.getType() == null) {
      return schema;
    }
    Class<?> raw = Json31.mapper().constructType(type.getType()).getRawClass();
    if (raw == Long.class) {
      schema.addExtension(BOXED_LONG, true);
    } else if (raw == LocalDateTime.class) {
      schema.setFormat(null);
      schema.setPattern("^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}$");
      schema.setExample("2026-09-22 14:30:00");
    }
    return schema;
  }
}
