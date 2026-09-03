package io.apocalypse.calendar.domain;

import java.util.List;

public record DataImportValidation(
    boolean valid, int rowCount, String validatorVersion, List<DataImportValidationIssue> issues) {

  public DataImportValidation {
    issues = List.copyOf(issues);
  }
}
