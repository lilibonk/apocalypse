package io.apocalypse.calendar.application;

import io.apocalypse.calendar.api.CalendarErrorCode;
import io.apocalypse.calendar.domain.BaselineReleaseRepository;
import io.apocalypse.calendar.domain.BaselineReleaseSnapshot;
import io.apocalypse.calendar.domain.CalendarContext;
import io.apocalypse.calendar.domain.DayField;
import io.apocalypse.calendar.domain.DayOverrideOperation;
import io.apocalypse.calendar.domain.OverrideContentHasher;
import io.apocalypse.calendar.domain.OverrideRevisionRepository;
import io.apocalypse.calendar.domain.OverrideRevisionSnapshot;
import io.apocalypse.calendar.domain.OverrideScope;
import io.apocalypse.calendar.domain.PersonalOverrideReplacement;
import io.apocalypse.calendar.domain.ResolvedDayField;
import io.apocalypse.calendar.interfaces.dto.request.DayFieldOperationReq;
import io.apocalypse.calendar.interfaces.dto.request.DayOverrideSaveReq;
import io.apocalypse.calendar.interfaces.dto.response.OverrideRevisionResp;
import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class PersonalOverrideService {

  private final CalendarCapabilityGuard capabilityGuard;

  private final CalendarAccessService calendarAccessService;

  private final DateQueryService dateQueryService;

  private final BaselineReleaseRepository baselineReleaseRepository;

  private final OverrideRevisionRepository overrideRevisionRepository;

  @Transactional(readOnly = true)
  public OverrideRevisionResp current(Long calendarId, LocalDate from, LocalDate to, Long userId) {
    capabilityGuard.requireEnabled();
    requireRange(from, to);
    calendarAccessService.requireVisible(calendarId, userId);
    return overrideRevisionRepository
        .findPublished(calendarId, OverrideScope.PERSONAL, userId)
        .map(revision -> OverrideResponseMapper.toResponse(revision, from, to))
        .orElse(null);
  }

  @Transactional
  public OverrideRevisionResp save(
      Long calendarId, LocalDate date, DayOverrideSaveReq request, Long userId, String actor) {
    capabilityGuard.requireEnabled();
    if (date == null || request == null || userId == null) {
      throw DayOverrideCommandFactory.invalidValue();
    }
    CalendarContext calendar = calendarAccessService.requireVisible(calendarId, userId);
    overrideRevisionRepository.lockPublishedPersonal(calendarId, userId);
    BaselineReleaseSnapshot release =
        baselineReleaseRepository
            .findPublished(calendar.regionCode())
            .orElseThrow(this::baselineUnavailable);
    OverrideRevisionSnapshot current =
        overrideRevisionRepository
            .findPublished(calendarId, OverrideScope.PERSONAL, userId)
            .orElse(null);
    int actualRevisionNo = current == null ? 0 : current.revisionNo();
    if (request.expectedRevisionNo() != actualRevisionNo) {
      throw new BizException(ErrorCode.CONFLICT);
    }

    List<DayFieldOperationReq> requested =
        DayOverrideCommandFactory.requireOperations(request.operations());
    Map<DayField, ResolvedDayField> underlay =
        dateQueryService.personalUnderlay(calendarId, date, userId);
    Map<OperationKey, DayOverrideOperation> snapshot = new HashMap<>();
    if (current != null) {
      current
          .operations()
          .forEach(
              operation ->
                  snapshot.put(new OperationKey(operation.date(), operation.field()), operation));
    }
    for (DayFieldOperationReq operation : requested) {
      ResolvedDayField fieldUnderlay = underlay.get(operation.field());
      snapshot.put(
          new OperationKey(date, operation.field()),
          DayOverrideCommandFactory.create(date, operation, fieldUnderlay));
    }
    DayOverrideCommandFactory.requireSnapshotSize(snapshot.size());
    List<DayOverrideOperation> operations =
        snapshot.values().stream()
            .sorted(
                Comparator.comparing(DayOverrideOperation::date)
                    .thenComparing(operation -> operation.field().name()))
            .toList();
    OverrideRevisionSnapshot published =
        overrideRevisionRepository.replacePublishedPersonal(
            new PersonalOverrideReplacement(
                calendarId,
                userId,
                release.id(),
                actualRevisionNo,
                OverrideContentHasher.hash(operations),
                actor,
                operations));
    return OverrideResponseMapper.toResponse(published);
  }

  private static void requireRange(LocalDate from, LocalDate to) {
    if (from == null || to == null || from.isAfter(to)) {
      throw new BizException(ErrorCode.PARAM_INVALID.getCode(), "日期范围无效");
    }
    if (ChronoUnit.DAYS.between(from, to) + 1 > 366) {
      throw batchLimit();
    }
  }

  private static BizException batchLimit() {
    CalendarErrorCode error = CalendarErrorCode.CALENDAR_BATCH_LIMIT_EXCEEDED;
    return new BizException(error.getCode(), error.getMessage());
  }

  private BizException baselineUnavailable() {
    CalendarErrorCode error = CalendarErrorCode.CALENDAR_BASELINE_UNAVAILABLE;
    return new BizException(error.getCode(), error.getMessage());
  }

  private record OperationKey(LocalDate date, DayField field) {}
}
