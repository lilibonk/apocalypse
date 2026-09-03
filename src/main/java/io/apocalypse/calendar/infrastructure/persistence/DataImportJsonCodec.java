package io.apocalypse.calendar.infrastructure.persistence;

import io.apocalypse.calendar.domain.DataImportDiff;
import io.apocalypse.calendar.domain.DataImportRow;
import io.apocalypse.calendar.domain.DataImportValidation;

import java.util.List;

import org.springframework.stereotype.Component;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

@Component
public class DataImportJsonCodec {

  private final ObjectMapper objectMapper;

  public DataImportJsonCodec(ObjectMapper objectMapper) {
    this.objectMapper = objectMapper;
  }

  public String writeRows(List<DataImportRow> rows) {
    return write(new Payload(1, rows));
  }

  public List<DataImportRow> readRows(Object json) {
    return json == null ? List.of() : read(json, Payload.class).rows();
  }

  public String writeValidation(DataImportValidation value) {
    return write(value);
  }

  public DataImportValidation readValidation(Object json) {
    return json == null ? null : read(json, DataImportValidation.class);
  }

  public String writeDiff(DataImportDiff value) {
    return value == null ? null : write(value);
  }

  public DataImportDiff readDiff(Object json) {
    return json == null ? null : read(json, DataImportDiff.class);
  }

  private String write(Object value) {
    try {
      return objectMapper.writeValueAsString(value);
    } catch (JacksonException e) {
      throw new IllegalStateException("Calendar 导入审计 JSON 无法序列化", e);
    }
  }

  private <T> T read(Object json, Class<T> type) {
    try {
      return objectMapper.readValue(json.toString(), type);
    } catch (JacksonException e) {
      throw new IllegalStateException("Calendar 导入审计 JSON 无法反序列化", e);
    }
  }

  private record Payload(int schemaVersion, List<DataImportRow> rows) {

    private Payload {
      rows = List.copyOf(rows);
    }
  }
}
