package io.apocalypse.calendar.infrastructure.persistence;

import io.apocalypse.calendar.domain.DayFieldValue;

import org.springframework.stereotype.Component;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

@Component
public class DayFieldValueJsonCodec {

  private final ObjectMapper objectMapper;

  public DayFieldValueJsonCodec(ObjectMapper objectMapper) {
    this.objectMapper = objectMapper;
  }

  public DayFieldValue read(String json) {
    if (json == null) {
      return null;
    }
    try {
      return objectMapper.readValue(json, DayFieldValue.class);
    } catch (JacksonException e) {
      throw new IllegalStateException("Calendar 覆盖值无法反序列化", e);
    }
  }

  public String write(DayFieldValue value) {
    if (value == null) {
      return null;
    }
    try {
      return objectMapper.writeValueAsString(value);
    } catch (JacksonException e) {
      throw new IllegalStateException("Calendar 覆盖值无法序列化", e);
    }
  }
}
