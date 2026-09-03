package io.apocalypse.calendar.application;

import io.apocalypse.calendar.domain.DayFieldSource;
import io.apocalypse.calendar.domain.DayFieldValue;
import io.apocalypse.calendar.domain.DayOverrideOperation;
import io.apocalypse.calendar.domain.LunarDateValue;
import io.apocalypse.calendar.domain.OverrideRevisionSnapshot;
import io.apocalypse.calendar.interfaces.dto.response.DayFieldValueResp;
import io.apocalypse.calendar.interfaces.dto.response.DayOverrideResp;
import io.apocalypse.calendar.interfaces.dto.response.DayPolicyResp;
import io.apocalypse.calendar.interfaces.dto.response.LunarDateResp;
import io.apocalypse.calendar.interfaces.dto.response.OverrideRevisionResp;
import io.apocalypse.calendar.interfaces.dto.response.ResolutionSourceResp;

import java.time.LocalDate;
import java.util.List;

final class OverrideResponseMapper {

  private OverrideResponseMapper() {}

  static OverrideRevisionResp toResponse(OverrideRevisionSnapshot revision) {
    return toResponse(revision, null, null);
  }

  static OverrideRevisionResp toResponse(
      OverrideRevisionSnapshot revision, LocalDate from, LocalDate to) {
    List<DayOverrideResp> items =
        revision.operations().stream()
            .filter(operation -> from == null || !operation.date().isBefore(from))
            .filter(operation -> to == null || !operation.date().isAfter(to))
            .map(OverrideResponseMapper::toResponse)
            .toList();
    return new OverrideRevisionResp(
        revision.id(),
        revision.calendarId(),
        revision.scope(),
        revision.revisionNo(),
        revision.state(),
        revision.baselineReleaseId(),
        revision.contentHash(),
        revision.version(),
        items);
  }

  private static DayOverrideResp toResponse(DayOverrideOperation operation) {
    DayFieldSource source = operation.savedUnderlaySource();
    return new DayOverrideResp(
        operation.id(),
        operation.date(),
        operation.field(),
        operation.action(),
        toResponse(operation.value()),
        toResponse(operation.savedUnderlay()),
        operation.savedUnderlayHash(),
        new ResolutionSourceResp(
            source.layer(),
            source.sourceCalendarId(),
            source.sourceCalendarKey(),
            source.sourceVersion(),
            source.action()));
  }

  static DayFieldValueResp toResponse(DayFieldValue value) {
    if (value == null) {
      return null;
    }
    LunarDateValue lunar = value.lunarDate();
    return new DayFieldValueResp(
        value.field(),
        lunar == null
            ? null
            : new LunarDateResp(
                lunar.year(), lunar.month(), lunar.day(), lunar.leapMonth(), lunar.displayText()),
        value.zodiac(),
        value.solarTerm(),
        value.dayPolicy() == null
            ? null
            : new DayPolicyResp(value.dayPolicy().classification(), value.dayPolicy().name()),
        value.text(),
        value.state());
  }
}
