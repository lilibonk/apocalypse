package io.apocalypse.calendar.application;

import io.apocalypse.calendar.api.CalendarErrorCode;
import io.apocalypse.calendar.domain.ConflictState;
import io.apocalypse.calendar.domain.DayField;
import io.apocalypse.calendar.domain.DayFieldResolver;
import io.apocalypse.calendar.domain.DayFieldValue;
import io.apocalypse.calendar.domain.DayOverrideOperation;
import io.apocalypse.calendar.domain.DayPolicyValue;
import io.apocalypse.calendar.domain.LunarDateValue;
import io.apocalypse.calendar.domain.OverrideAction;
import io.apocalypse.calendar.domain.ResolvedDayField;
import io.apocalypse.calendar.interfaces.dto.request.DayFieldOperationReq;
import io.apocalypse.calendar.interfaces.dto.request.DayFieldValueReq;
import io.apocalypse.calendar.interfaces.dto.request.DayPolicyReq;
import io.apocalypse.calendar.interfaces.dto.request.LunarDateReq;
import io.apocalypse.common.exception.BizException;

import java.time.LocalDate;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.springframework.util.StringUtils;

final class DayOverrideCommandFactory {

  private static final int MAX_COMMAND_ITEMS = 200;

  private static final int MAX_SNAPSHOT_ITEMS = 10_000;

  private DayOverrideCommandFactory() {}

  static List<DayFieldOperationReq> requireOperations(List<DayFieldOperationReq> operations) {
    if (operations == null || operations.isEmpty()) {
      throw invalidValue();
    }
    if (operations.size() > MAX_COMMAND_ITEMS) {
      throw batchLimit();
    }
    Set<DayField> fields = new HashSet<>();
    for (DayFieldOperationReq operation : operations) {
      if (operation == null
          || operation.field() == null
          || operation.action() == null
          || operation.action() == OverrideAction.BASE
          || !fields.add(operation.field())) {
        throw invalidValue();
      }
    }
    return List.copyOf(operations);
  }

  static DayOverrideOperation create(
      LocalDate date, DayFieldOperationReq operation, ResolvedDayField underlay) {
    DayFieldValue value = validateAndConvert(operation);
    return new DayOverrideOperation(
        null,
        date,
        operation.field(),
        operation.action(),
        value,
        underlay.value(),
        DayFieldResolver.hash(underlay.value()),
        underlay.source(),
        ConflictState.NONE,
        null,
        null);
  }

  static void requireSnapshotSize(int size) {
    if (size > MAX_SNAPSHOT_ITEMS) {
      throw batchLimit();
    }
  }

  private static DayFieldValue validateAndConvert(DayFieldOperationReq operation) {
    if (operation.action() == OverrideAction.CLEAR
        || operation.action() == OverrideAction.INHERIT) {
      if (operation.value() != null) {
        throw invalidValue();
      }
      return null;
    }
    DayFieldValueReq value = operation.value();
    if (operation.action() != OverrideAction.SET || value == null || valueSlots(value) != 1) {
      throw invalidValue();
    }
    try {
      return switch (operation.field()) {
        case LUNAR_DATE -> lunar(value);
        case ZODIAC -> DayFieldValue.zodiac(value.zodiac());
        case SOLAR_TERM -> DayFieldValue.solarTerm(value.solarTerm());
        case DAY_POLICY -> dayPolicy(value.dayPolicy());
        case DISPLAY_LABEL ->
            DayFieldValue.text(DayField.DISPLAY_LABEL, requireText(value.text(), 64));
        case DISPLAY_NOTE ->
            DayFieldValue.text(DayField.DISPLAY_NOTE, requireText(value.text(), 500));
      };
    } catch (IllegalArgumentException | NullPointerException e) {
      throw invalidValue();
    }
  }

  private static DayFieldValue lunar(DayFieldValueReq value) {
    if (value.lunarDate() == null) {
      throw invalidValue();
    }
    LunarDateReq lunar = value.lunarDate();
    if (lunar.year() < 1
        || lunar.month() < 1
        || lunar.month() > 12
        || lunar.day() < 1
        || lunar.day() > 30) {
      throw invalidValue();
    }
    String displayText =
        "农历"
            + lunar.year()
            + "年"
            + (lunar.leapMonth() ? "闰" : "")
            + lunar.month()
            + "月"
            + lunar.day()
            + "日";
    return DayFieldValue.lunar(
        new LunarDateValue(
            lunar.year(), lunar.month(), lunar.day(), lunar.leapMonth(), displayText));
  }

  private static DayFieldValue dayPolicy(DayPolicyReq value) {
    if (value == null || value.classification() == null) {
      throw invalidValue();
    }
    String name = value.name() == null ? null : value.name().trim();
    if (name != null && name.length() > 64) {
      throw invalidValue();
    }
    return DayFieldValue.dayPolicy(new DayPolicyValue(value.classification(), name));
  }

  private static String requireText(String value, int maxLength) {
    if (!StringUtils.hasText(value)) {
      throw invalidValue();
    }
    String trimmed = value.trim();
    if (trimmed.length() > maxLength) {
      throw invalidValue();
    }
    return trimmed;
  }

  private static int valueSlots(DayFieldValueReq value) {
    int slots = 0;
    slots += value.lunarDate() == null ? 0 : 1;
    slots += value.zodiac() == null ? 0 : 1;
    slots += value.solarTerm() == null ? 0 : 1;
    slots += value.dayPolicy() == null ? 0 : 1;
    slots += value.text() == null ? 0 : 1;
    return slots;
  }

  static BizException invalidValue() {
    CalendarErrorCode error = CalendarErrorCode.CALENDAR_OVERRIDE_VALUE_INVALID;
    return new BizException(error.getCode(), error.getMessage());
  }

  private static BizException batchLimit() {
    CalendarErrorCode error = CalendarErrorCode.CALENDAR_BATCH_LIMIT_EXCEEDED;
    return new BizException(error.getCode(), error.getMessage());
  }
}
