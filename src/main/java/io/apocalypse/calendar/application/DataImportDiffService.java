package io.apocalypse.calendar.application;

import io.apocalypse.calendar.domain.BaselineReleaseRepository;
import io.apocalypse.calendar.domain.CalendarContext;
import io.apocalypse.calendar.domain.CalendarContextRepository;
import io.apocalypse.calendar.domain.DataImportDiff;
import io.apocalypse.calendar.domain.DataImportDiffItem;
import io.apocalypse.calendar.domain.DataImportRow;
import io.apocalypse.calendar.domain.DataImportSnapshot;
import io.apocalypse.calendar.domain.DataImportTarget;
import io.apocalypse.calendar.domain.DayClassification;
import io.apocalypse.calendar.domain.DayField;
import io.apocalypse.calendar.domain.DayFieldResolver;
import io.apocalypse.calendar.domain.DayOverrideOperation;
import io.apocalypse.calendar.domain.OverrideAction;
import io.apocalypse.calendar.domain.OverrideRevisionRepository;
import io.apocalypse.calendar.domain.OverrideRevisionSnapshot;
import io.apocalypse.calendar.domain.OverrideScope;
import io.apocalypse.calendar.interfaces.dto.response.DayPolicyResp;
import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
class DataImportDiffService {

  private static final String EMPTY_TARGET_HASH =
      DataImportFilePolicy.sha256("calendar-empty-target-v1");

  private final BaselineReleaseRepository baselineReleaseRepository;

  private final CalendarContextRepository calendarContextRepository;

  private final OverrideRevisionRepository overrideRevisionRepository;

  private final DateQueryService dateQueryService;

  DataImportDiff compute(DataImportSnapshot value, Long userId) {
    return value.target() == DataImportTarget.SYSTEM_BASELINE
        ? systemDiff(value, userId)
        : managedDiff(value, userId);
  }

  String currentTargetHash(DataImportSnapshot value) {
    if (value.target() == DataImportTarget.SYSTEM_BASELINE) {
      return baselineReleaseRepository
          .findPublished(value.regionCode())
          .orElseThrow(DataImportDiffService::notFound)
          .contentHash();
    }
    return overrideRevisionRepository
        .findPublished(value.targetCalendarId(), OverrideScope.MANAGED, null)
        .map(OverrideRevisionSnapshot::contentHash)
        .orElse(EMPTY_TARGET_HASH);
  }

  private DataImportDiff systemDiff(DataImportSnapshot value, Long userId) {
    CalendarContext systemCalendar =
        calendarContextRepository
            .findSystemByRegion(value.regionCode())
            .orElseThrow(DataImportDiffService::notFound);
    List<DataImportDiffItem> items = new ArrayList<>();
    Counters counters = new Counters();
    for (DataImportRow row : value.rows()) {
      DayPolicyResp old =
          dateQueryService
              .detail(systemCalendar.id(), row.date(), null, userId, false)
              .effective()
              .dayPolicy();
      DayClassification oldClassification = old == null ? null : old.classification();
      String oldName = old == null ? null : old.name();
      String change =
          Objects.equals(oldClassification, row.classification())
                  && Objects.equals(oldName, row.name())
              ? "UNCHANGED"
              : isDefault(oldClassification) ? "ADDED" : "MODIFIED";
      counters.add(change);
      items.add(
          new DataImportDiffItem(
              row.date(),
              change,
              OverrideAction.BASE,
              oldClassification,
              oldName,
              row.action(),
              row.classification(),
              row.name()));
    }
    return counters.result(currentTargetHash(value), items, 0);
  }

  private DataImportDiff managedDiff(DataImportSnapshot value, Long userId) {
    OverrideRevisionSnapshot published =
        overrideRevisionRepository
            .findPublished(value.targetCalendarId(), OverrideScope.MANAGED, null)
            .orElse(null);
    Map<LocalDate, DayOverrideOperation> current = new HashMap<>();
    if (published != null) {
      published.operations().stream()
          .filter(operation -> operation.field() == DayField.DAY_POLICY)
          .forEach(operation -> current.put(operation.date(), operation));
    }
    List<DataImportDiffItem> items = new ArrayList<>();
    Counters counters = new Counters();
    for (DataImportRow row : value.rows()) {
      DayOverrideOperation old = current.get(row.date());
      DayClassification oldClassification = classification(old);
      String oldName = name(old);
      OverrideAction oldAction = old == null ? null : old.action();
      String change = change(oldAction, oldClassification, oldName, row);
      counters.add(change);
      items.add(
          new DataImportDiffItem(
              row.date(),
              change,
              oldAction,
              oldClassification,
              oldName,
              row.action(),
              row.classification(),
              row.name()));
    }
    int conflicts = countConflicts(value, userId, current.values());
    return counters.result(currentTargetHash(value), items, conflicts);
  }

  private int countConflicts(
      DataImportSnapshot value, Long userId, Iterable<DayOverrideOperation> operations) {
    int conflicts = 0;
    for (DayOverrideOperation operation : operations) {
      if (operation.date().getYear() != value.dataYear()
          || operation.action() == OverrideAction.INHERIT) {
        continue;
      }
      String currentHash =
          DayFieldResolver.hash(
              dateQueryService
                  .managedUnderlay(value.targetCalendarId(), operation.date(), userId)
                  .get(operation.field())
                  .value());
      if (!Objects.equals(operation.savedUnderlayHash(), currentHash)) {
        conflicts++;
      }
    }
    return conflicts;
  }

  private static String change(
      OverrideAction oldAction,
      DayClassification oldClassification,
      String oldName,
      DataImportRow row) {
    if (oldAction == row.action()
        && Objects.equals(oldClassification, row.classification())
        && Objects.equals(oldName, row.name())) {
      return "UNCHANGED";
    }
    if (row.action() == OverrideAction.INHERIT) {
      return "INHERITED";
    }
    return oldAction == null ? "ADDED" : "MODIFIED";
  }

  private static DayClassification classification(DayOverrideOperation value) {
    return value == null || value.value() == null || value.value().dayPolicy() == null
        ? null
        : value.value().dayPolicy().classification();
  }

  private static String name(DayOverrideOperation value) {
    return value == null || value.value() == null || value.value().dayPolicy() == null
        ? null
        : value.value().dayPolicy().name();
  }

  private static boolean isDefault(DayClassification value) {
    return value == null
        || value == DayClassification.NORMAL_WORKDAY
        || value == DayClassification.WEEKEND_REST;
  }

  private static BizException notFound() {
    return new BizException(ErrorCode.NOT_FOUND);
  }

  private static final class Counters {
    private int added;

    private int modified;

    private int inherited;

    private int unchanged;

    private void add(String change) {
      switch (change) {
        case "ADDED" -> added++;
        case "MODIFIED" -> modified++;
        case "INHERITED" -> inherited++;
        case "UNCHANGED" -> unchanged++;
        default -> throw new IllegalArgumentException("未知导入 diff 类型");
      }
    }

    private DataImportDiff result(
        String targetContentHash, List<DataImportDiffItem> items, int conflicts) {
      return new DataImportDiff(
          added, modified, inherited, unchanged, conflicts, targetContentHash, List.copyOf(items));
    }
  }
}
