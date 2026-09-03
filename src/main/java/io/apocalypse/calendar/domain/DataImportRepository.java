package io.apocalypse.calendar.domain;

import io.apocalypse.common.response.PageResult;

import java.util.List;
import java.util.Optional;

public interface DataImportRepository {

  void lockStorageQuota();

  DataImportStorageUsage storageUsage(
      Long uploaderUserId, DataImportTarget target, Long targetCalendarId, String regionCode);

  DataImportSnapshot create(DataImportCreate command);

  Optional<DataImportSnapshot> findById(Long id);

  DataImportSnapshot findByIdForUpdate(Long id);

  PageResult<DataImportSnapshot> pageVisible(Long userId, int page, int size);

  void saveValidation(
      Long id,
      int expectedVersion,
      List<DataImportRow> rows,
      String normalizedPayloadHash,
      DataImportValidation validation,
      DataImportDiff diff,
      DataImportState state,
      String actor);

  void review(Long id, int expectedVersion, DataImportDiff diff, String reviewNote, String actor);

  void reject(Long id, int expectedVersion, String reviewNote, String actor);

  void markPublished(Long id, int expectedVersion, Long releaseId, Long revisionId, String actor);
}
