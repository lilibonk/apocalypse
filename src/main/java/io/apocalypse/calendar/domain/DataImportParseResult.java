package io.apocalypse.calendar.domain;

import java.util.List;

public record DataImportParseResult(
    List<DataImportRow> rows, DataImportValidation validation, String normalizedPayloadHash) {

  public DataImportParseResult {
    rows = List.copyOf(rows);
  }
}
