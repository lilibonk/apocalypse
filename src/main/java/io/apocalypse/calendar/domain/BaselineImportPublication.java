package io.apocalypse.calendar.domain;

import java.util.List;

public record BaselineImportPublication(
    Long currentReleaseId,
    String releaseKey,
    Long sourceImportId,
    int replacedYear,
    String contentHash,
    String sourceManifestUri,
    String reason,
    String actor,
    List<BaselineCorrectionSnapshot> importedCorrections) {

  public BaselineImportPublication {
    importedCorrections = List.copyOf(importedCorrections);
  }
}
