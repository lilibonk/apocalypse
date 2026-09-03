package io.apocalypse.calendar.interfaces.dto.response;

import java.util.List;

public record ImportDiffResp(
    int added,
    int modified,
    int inherited,
    int unchanged,
    int conflicts,
    String targetContentHash,
    List<ImportDiffItemResp> items) {

  public ImportDiffResp {
    items = List.copyOf(items);
  }
}
