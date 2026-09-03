package io.apocalypse.calendar.interfaces.dto.response;

import java.util.List;

public record ImportValidationResp(
    boolean valid, int rowCount, String validatorVersion, List<ImportValidationIssueResp> issues) {

  public ImportValidationResp {
    issues = List.copyOf(issues);
  }
}
