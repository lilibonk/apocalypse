package io.apocalypse.calendar.application;

import io.apocalypse.calendar.domain.BaselineReleaseRepository;
import io.apocalypse.calendar.domain.BaselineReleaseSnapshot;
import io.apocalypse.calendar.domain.CalendarContextRepository;
import io.apocalypse.calendar.domain.CalendarRole;
import io.apocalypse.calendar.domain.DataImportDiff;
import io.apocalypse.calendar.domain.DataImportParseResult;
import io.apocalypse.calendar.domain.DataImportParser;
import io.apocalypse.calendar.domain.DataImportRepository;
import io.apocalypse.calendar.domain.DataImportSnapshot;
import io.apocalypse.calendar.domain.DataImportState;
import io.apocalypse.calendar.domain.DataImportTarget;
import io.apocalypse.calendar.domain.DataImportValidation;
import io.apocalypse.calendar.domain.ImportAssuranceLevel;
import io.apocalypse.calendar.domain.ImportFileEvidence;
import io.apocalypse.calendar.domain.ImportSourceClaim;
import io.apocalypse.calendar.domain.OverrideRevisionRepository;
import io.apocalypse.calendar.interfaces.dto.request.DataImportPublishReq;
import io.apocalypse.common.exception.BizException;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DataImportServicePublicationLockTest {

  private static final Long USER_ID = 7L;

  private final CalendarCapabilityGuard capabilityGuard = mock(CalendarCapabilityGuard.class);

  private final CalendarAccessService calendarAccessService = mock(CalendarAccessService.class);

  private final CalendarContextRepository calendarContextRepository =
      mock(CalendarContextRepository.class);

  private final DataImportRepository dataImportRepository = mock(DataImportRepository.class);

  private final DataImportParser dataImportParser = mock(DataImportParser.class);

  private final DataImportDiffService diffService = mock(DataImportDiffService.class);

  private final CalendarImportStorageGuard storageGuard = mock(CalendarImportStorageGuard.class);

  private final BaselineReleaseRepository baselineReleaseRepository =
      mock(BaselineReleaseRepository.class);

  private final OverrideRevisionRepository overrideRevisionRepository =
      mock(OverrideRevisionRepository.class);

  private final DateQueryService dateQueryService = mock(DateQueryService.class);

  private final DataImportService service =
      new DataImportService(
          capabilityGuard,
          calendarAccessService,
          calendarContextRepository,
          dataImportRepository,
          dataImportParser,
          diffService,
          storageGuard,
          baselineReleaseRepository,
          overrideRevisionRepository,
          dateQueryService);

  @Test
  void systemPublicationLocksStableRegionBeforeRecomputingTargetHash() {
    DataImportSnapshot value = reviewed(DataImportTarget.SYSTEM_BASELINE, null);
    prepare(value);
    when(baselineReleaseRepository.findPublished("CN")).thenReturn(Optional.of(baselineRelease()));

    assertTargetHashConflict(value);

    InOrder order = inOrder(baselineReleaseRepository, diffService);
    order.verify(baselineReleaseRepository).lockPublicationScope("CN");
    order.verify(diffService).compute(any(DataImportSnapshot.class), eq(USER_ID));
    verify(baselineReleaseRepository, never()).publishImport(any());
  }

  @Test
  void managedPublicationLocksExistingScopeBeforeRecomputingTargetHash() {
    DataImportSnapshot value = reviewed(DataImportTarget.MANAGED_OVERRIDE, 42L);
    prepare(value);
    when(calendarAccessService.requireRole(42L, USER_ID, CalendarRole.PUBLISHER))
        .thenReturn(CalendarRole.PUBLISHER);

    assertTargetHashConflict(value);

    InOrder order = inOrder(overrideRevisionRepository, diffService);
    order.verify(overrideRevisionRepository).lockManagedScope(42L);
    order.verify(diffService).compute(any(DataImportSnapshot.class), eq(USER_ID));
    verify(overrideRevisionRepository, never()).replaceManagedDraft(any());
  }

  @Test
  void systemPublicationCannotRebindReviewedImportToCurrentTargetHash() {
    DataImportSnapshot value = reviewed(DataImportTarget.SYSTEM_BASELINE, null);
    prepare(value);
    when(baselineReleaseRepository.findPublished("CN")).thenReturn(Optional.of(baselineRelease()));

    assertReviewedHashCannotBeRebound(value);

    verify(baselineReleaseRepository, never()).publishImport(any());
  }

  @Test
  void managedPublicationCannotRebindReviewedImportToCurrentTargetHash() {
    DataImportSnapshot value = reviewed(DataImportTarget.MANAGED_OVERRIDE, 42L);
    prepare(value);
    when(calendarAccessService.requireRole(42L, USER_ID, CalendarRole.PUBLISHER))
        .thenReturn(CalendarRole.PUBLISHER);

    assertReviewedHashCannotBeRebound(value);

    verify(overrideRevisionRepository, never()).replaceManagedDraft(any());
  }

  private void prepare(DataImportSnapshot value) {
    when(dataImportRepository.findByIdForUpdate(value.id())).thenReturn(value);
    when(dataImportParser.parse(any()))
        .thenReturn(
            new DataImportParseResult(
                value.rows(),
                new DataImportValidation(true, value.rows().size(), "test", List.of()),
                value.normalizedPayloadHash()));
    when(diffService.compute(any(DataImportSnapshot.class), eq(USER_ID)))
        .thenReturn(new DataImportDiff(0, 0, 0, 0, 0, "actual-target", List.of()));
  }

  private void assertTargetHashConflict(DataImportSnapshot value) {
    assertThatThrownBy(
            () ->
                service.publish(
                    value.id(),
                    new DataImportPublishReq(
                        value.version(), value.normalizedPayloadHash(), "reviewed-target"),
                    USER_ID,
                    "publisher"))
        .isInstanceOfSatisfying(
            BizException.class, error -> assertThat(error.getCode()).isEqualTo(40900));
  }

  private void assertReviewedHashCannotBeRebound(DataImportSnapshot value) {
    assertThatThrownBy(
            () ->
                service.publish(
                    value.id(),
                    new DataImportPublishReq(
                        value.version(), value.normalizedPayloadHash(), "actual-target"),
                    USER_ID,
                    "publisher"))
        .isInstanceOfSatisfying(
            BizException.class, error -> assertThat(error.getCode()).isEqualTo(40900));
  }

  private static DataImportSnapshot reviewed(DataImportTarget target, Long targetCalendarId) {
    byte[] bytes = "x".getBytes(StandardCharsets.UTF_8);
    ImportFileEvidence data =
        new ImportFileEvidence(
            "annual.csv", "text/csv", bytes.length, DataImportFilePolicy.sha256(bytes), bytes);
    boolean system = target == DataImportTarget.SYSTEM_BASELINE;
    return new DataImportSnapshot(
        system ? 1L : 2L,
        system ? "system-lock-order" : "managed-lock-order",
        target,
        targetCalendarId,
        "CN",
        2027,
        system ? ImportSourceClaim.OFFICIAL_NOTICE : ImportSourceClaim.LOCAL_POLICY,
        system ? ImportAssuranceLevel.OFFLINE_DOCUMENT_REVIEWED : ImportAssuranceLevel.UNVERIFIED,
        system ? "测试文号" : null,
        system ? "测试通知" : null,
        system ? "测试签发单位" : null,
        system ? LocalDate.of(2026, 12, 1) : null,
        null,
        data,
        null,
        List.of(),
        "normalized",
        new DataImportValidation(true, 0, "test", List.of()),
        new DataImportDiff(0, 0, 0, 0, 0, "reviewed-target", List.of()),
        DataImportState.REVIEWED,
        LocalDateTime.of(2026, 12, 2, 9, 0),
        "reviewer",
        null,
        null,
        null,
        null,
        null,
        2);
  }

  private static BaselineReleaseSnapshot baselineRelease() {
    return new BaselineReleaseSnapshot(
        1L,
        "CN",
        "CN-R1",
        "provider",
        "1",
        "artifact",
        "bundle",
        "bundle-hash",
        LocalDate.of(1901, 1, 1),
        LocalDate.of(2100, 12, 31),
        "target");
  }
}
