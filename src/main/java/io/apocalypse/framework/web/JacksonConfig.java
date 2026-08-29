package io.apocalypse.framework.web;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

import org.springframework.boot.jackson.autoconfigure.JsonMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import tools.jackson.databind.ext.javatime.deser.LocalDateTimeDeserializer;
import tools.jackson.databind.ext.javatime.ser.LocalDateTimeSerializer;
import tools.jackson.databind.module.SimpleModule;
import tools.jackson.databind.ser.std.ToStringSerializer;

/**
 * Jackson 全局序列化定制（Boot 4 / Jackson 3）。 时间格式统一为 {@code yyyy-MM-dd HH:mm:ss}。
 *
 * <p>取舍说明：仅对<b>装箱类型</b> {@link Long} 注册 {@link ToStringSerializer}——雪花 ID 以 {@code Long}
 * 字段承载，序列化为字符串可避免 JS Number 精度丢失；而原生 {@code long}（如分页 total） 不受影响，仍以数字输出，避免破坏前端数值计算。
 */
@Configuration
public class JacksonConfig {

  private static final String DATETIME_PATTERN = "yyyy-MM-dd HH:mm:ss";

  @Bean
  public JsonMapperBuilderCustomizer apocalypseJacksonCustomizer() {
    return builder -> {
      DateTimeFormatter formatter = DateTimeFormatter.ofPattern(DATETIME_PATTERN);
      SimpleModule module = new SimpleModule("apocalypse");
      module.addSerializer(LocalDateTime.class, new LocalDateTimeSerializer(formatter));
      module.addDeserializer(LocalDateTime.class, new LocalDateTimeDeserializer(formatter));
      module.addSerializer(Long.class, ToStringSerializer.instance);
      builder.addModule(module);
    };
  }
}
