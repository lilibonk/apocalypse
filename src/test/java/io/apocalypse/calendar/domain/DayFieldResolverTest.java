package io.apocalypse.calendar.domain;

import java.time.LocalDate;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class DayFieldResolverTest {

  private static final LocalDate DATE = LocalDate.of(2026, 2, 17);

  private static final DayFieldSource BASE_SOURCE =
      new DayFieldSource(SourceLayer.SYSTEM_DATASET, 1L, "system-cn", "R1", OverrideAction.BASE);

  @Test
  void appliesManagedThenMoreSpecificThenPersonalAndKeepsFieldProvenance() {
    DayFieldValue system = DayFieldValue.text(DayField.DISPLAY_LABEL, "A");
    DayFieldValue parent = DayFieldValue.text(DayField.DISPLAY_LABEL, "B");
    DayFieldValue target = DayFieldValue.text(DayField.DISPLAY_LABEL, "C");
    DayFieldValue personal = DayFieldValue.text(DayField.DISPLAY_LABEL, "D");

    Map<DayField, ResolvedDayField> result =
        DayFieldResolver.resolve(
            DATE,
            baseline(system),
            BASE_SOURCE,
            List.of(
                layer(SourceLayer.MANAGED_OVERRIDE, 2L, "school", "1", set(parent, system)),
                layer(SourceLayer.MANAGED_OVERRIDE, 3L, "class", "2", set(target, parent)),
                layer(SourceLayer.PERSONAL_OVERRIDE, 3L, "class", "7", set(personal, target))));

    ResolvedDayField label = result.get(DayField.DISPLAY_LABEL);
    assertThat(label.value().text()).isEqualTo("D");
    assertThat(label.source().layer()).isEqualTo(SourceLayer.PERSONAL_OVERRIDE);
    assertThat(label.source().sourceCalendarKey()).isEqualTo("class");
    assertThat(label.underlay().text()).isEqualTo("C");
    assertThat(label.conflictState()).isEqualTo(ConflictState.NONE);
  }

  @Test
  void clearIsExplicitAndInheritPreservesTheLowerLayer() {
    DayFieldValue system = DayFieldValue.text(DayField.DISPLAY_LABEL, "A");
    DayFieldValue parent = DayFieldValue.text(DayField.DISPLAY_LABEL, "B");
    DayOverrideOperation clear = operation(OverrideAction.CLEAR, null, parent, ConflictState.NONE);
    DayOverrideOperation inherit =
        operation(OverrideAction.INHERIT, null, null, ConflictState.NONE);

    var cleared =
        DayFieldResolver.resolve(
            DATE,
            baseline(system),
            BASE_SOURCE,
            List.of(
                layer(SourceLayer.MANAGED_OVERRIDE, 2L, "school", "1", set(parent, system)),
                layer(SourceLayer.MANAGED_OVERRIDE, 3L, "class", "1", clear)));
    var inherited =
        DayFieldResolver.resolve(
            DATE,
            baseline(system),
            BASE_SOURCE,
            List.of(
                layer(SourceLayer.MANAGED_OVERRIDE, 2L, "school", "1", set(parent, system)),
                layer(SourceLayer.MANAGED_OVERRIDE, 3L, "class", "1", inherit)));

    assertThat(cleared.get(DayField.DISPLAY_LABEL).value().state())
        .isEqualTo(FieldValueState.CLEARED);
    assertThat(cleared.get(DayField.DISPLAY_LABEL).source().action())
        .isEqualTo(OverrideAction.CLEAR);
    assertThat(inherited.get(DayField.DISPLAY_LABEL).value().text()).isEqualTo("B");
    assertThat(inherited.get(DayField.DISPLAY_LABEL).source().sourceCalendarKey())
        .isEqualTo("school");
  }

  @Test
  void staleSavedUnderlayMarksConflictButOverrideStillWins() {
    DayFieldValue originalSystem = DayFieldValue.text(DayField.DISPLAY_LABEL, "A");
    DayFieldValue changedSystem = DayFieldValue.text(DayField.DISPLAY_LABEL, "A2");
    DayFieldValue userValue = DayFieldValue.text(DayField.DISPLAY_LABEL, "D");
    DayOverrideOperation operation = set(userValue, originalSystem);

    var result =
        DayFieldResolver.resolve(
            DATE,
            baseline(changedSystem),
            BASE_SOURCE,
            List.of(layer(SourceLayer.PERSONAL_OVERRIDE, 1L, "system-cn", "2", operation)));

    ResolvedDayField label = result.get(DayField.DISPLAY_LABEL);
    assertThat(label.value().text()).isEqualTo("D");
    assertThat(label.underlay().text()).isEqualTo("A2");
    assertThat(label.conflictState()).isEqualTo(ConflictState.NEEDS_REVIEW);
  }

  private static Map<DayField, DayFieldValue> baseline(DayFieldValue label) {
    EnumMap<DayField, DayFieldValue> baseline = new EnumMap<>(DayField.class);
    baseline.put(
        DayField.LUNAR_DATE,
        DayFieldValue.lunar(new LunarDateValue(2026, 1, 1, false, "二〇二六年正月初一")));
    baseline.put(DayField.ZODIAC, DayFieldValue.zodiac(Zodiac.HORSE));
    baseline.put(
        DayField.SOLAR_TERM, DayFieldValue.empty(DayField.SOLAR_TERM, FieldValueState.CLEARED));
    baseline.put(
        DayField.DAY_POLICY,
        DayFieldValue.dayPolicy(new DayPolicyValue(DayClassification.OFFICIAL_REST, "春节")));
    baseline.put(DayField.DISPLAY_LABEL, label);
    baseline.put(
        DayField.DISPLAY_NOTE, DayFieldValue.empty(DayField.DISPLAY_NOTE, FieldValueState.CLEARED));
    return baseline;
  }

  private static OverrideLayer layer(
      SourceLayer layer,
      Long calendarId,
      String calendarKey,
      String version,
      DayOverrideOperation operation) {
    return new OverrideLayer(layer, calendarId, calendarKey, version, List.of(operation));
  }

  private static DayOverrideOperation set(DayFieldValue value, DayFieldValue underlay) {
    return operation(OverrideAction.SET, value, underlay, ConflictState.NONE);
  }

  private static DayOverrideOperation operation(
      OverrideAction action,
      DayFieldValue value,
      DayFieldValue underlay,
      ConflictState conflictState) {
    return new DayOverrideOperation(
        1L,
        DATE,
        DayField.DISPLAY_LABEL,
        action,
        value,
        underlay,
        underlay == null ? null : DayFieldResolver.hash(underlay),
        BASE_SOURCE,
        conflictState,
        null,
        null);
  }
}
