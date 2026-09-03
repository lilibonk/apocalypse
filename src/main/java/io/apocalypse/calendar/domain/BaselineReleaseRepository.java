package io.apocalypse.calendar.domain;

import java.util.List;
import java.util.Optional;

public interface BaselineReleaseRepository {

  void lockPublicationScope(String regionCode);

  Optional<BaselineReleaseSnapshot> findPublished(String regionCode);

  List<BaselineCorrectionSnapshot> findCorrections(Long releaseId);

  BaselineReleaseSnapshot publishImport(BaselineImportPublication publication);
}
