package io.apocalypse.calendar.domain;

import java.util.List;

public record DataImportDiff(
    int added,
    int modified,
    int inherited,
    int unchanged,
    int conflicts,
    String targetContentHash,
    List<DataImportDiffItem> items) {

  public DataImportDiff {
    items = List.copyOf(items);
  }
}
