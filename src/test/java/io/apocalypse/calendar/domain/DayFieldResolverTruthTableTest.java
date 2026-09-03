package io.apocalypse.calendar.domain;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.MethodSource;

import static org.assertj.core.api.Assertions.assertThat;

/** 6 fields × 3 system correction choices × 4 parent/target/personal choices = 1152 cases. */
class DayFieldResolverTruthTableTest {
  private static final LocalDate DATE = LocalDate.of(2026, 9, 2);
  private static final DayFieldSource BASE =
      new DayFieldSource(SourceLayer.SYSTEM_DATASET, 1L, "system-cn", "R1", OverrideAction.BASE);
  private static final SourceLayer[] SOURCES = {
    SourceLayer.SYSTEM_CORRECTION, SourceLayer.MANAGED_OVERRIDE,
    SourceLayer.MANAGED_OVERRIDE, SourceLayer.PERSONAL_OVERRIDE
  };

  static Stream<Arguments> truthTable() {
    List<Arguments> cases = new ArrayList<>();
    for (DayField field : DayField.values()) {
      for (int correction = 0; correction < 3; correction++) {
        for (int parent = 0; parent < 4; parent++) {
          for (int target = 0; target < 4; target++) {
            for (int personal = 0; personal < 4; personal++) {
              cases.add(Arguments.of(field, correction, parent, target, personal));
            }
          }
        }
      }
    }
    return cases.stream();
  }

  @ParameterizedTest(name = "{0}: system={1}, parent={2}, target={3}, personal={4}")
  @MethodSource("truthTable")
  void mostSpecificExplicitValueWinsWithExactProvenance(
      DayField field, int correction, int parent, int target, int personal) {
    // 0 absent, 1 SET, 2 CLEAR, 3 INHERIT; SYSTEM corrections only allow absent/SET/CLEAR.
    int[] choices = {correction, parent, target, personal};
    List<OverrideLayer> layers = new ArrayList<>();
    List<Integer> explicit = new ArrayList<>();
    for (int i = 0; i < choices.length; i++) {
      if (choices[i] == 0) continue;
      OverrideAction action =
          switch (choices[i]) {
            case 1 -> OverrideAction.SET;
            case 2 -> OverrideAction.CLEAR;
            default -> OverrideAction.INHERIT;
          };
      layers.add(
          new OverrideLayer(
              SOURCES[i],
              (long) i + 1,
              "layer-" + i,
              "revision-" + i,
              List.of(
                  new DayOverrideOperation(
                      (long) i + 10,
                      DATE,
                      field,
                      action,
                      action == OverrideAction.SET ? value(field, i + 1) : null,
                      null,
                      null,
                      BASE,
                      ConflictState.NONE,
                      null,
                      null))));
      if (choices[i] == 1 || choices[i] == 2) explicit.add(i);
    }
    Map<DayField, DayFieldValue> original = baseline();
    var resolved = DayFieldResolver.resolve(DATE, original, BASE, layers);
    var actual = resolved.get(field);
    if (explicit.isEmpty()) {
      assertThat(actual.value()).isEqualTo(original.get(field));
      assertThat(actual.source()).isEqualTo(BASE);
      assertThat(actual.underlay()).isNull();
    } else {
      int winner = explicit.getLast();
      DayFieldValue expected = selectedValue(field, choices[winner], winner);
      DayFieldValue underlay =
          explicit.size() == 1
              ? original.get(field)
              : selectedValue(
                  field,
                  choices[explicit.get(explicit.size() - 2)],
                  explicit.get(explicit.size() - 2));
      assertThat(actual.value()).isEqualTo(expected);
      assertThat(actual.source())
          .isEqualTo(
              new DayFieldSource(
                  SOURCES[winner],
                  (long) winner + 1,
                  "layer-" + winner,
                  "revision-" + winner,
                  choices[winner] == 1 ? OverrideAction.SET : OverrideAction.CLEAR));
      assertThat(actual.underlay()).isEqualTo(underlay);
      assertThat(actual.underlayHash()).isEqualTo(DayFieldResolver.hash(underlay));
    }
    assertThat(actual.conflictState()).isEqualTo(ConflictState.NONE);
    Arrays.stream(DayField.values())
        .filter(other -> other != field)
        .forEach(
            other -> {
              assertThat(resolved.get(other).value()).isEqualTo(original.get(other));
              assertThat(resolved.get(other).source()).isEqualTo(BASE);
            });
  }

  @ParameterizedTest
  @EnumSource(DayField.class)
  void baselineUpgradeKeepsUserIntentAndKeepIsValidOnlyForReviewedUnderlay(DayField field) {
    var before = value(field, 0);
    var after = value(field, 1);
    var chosen = value(field, 4);
    for (var action : List.of(OverrideAction.SET, OverrideAction.CLEAR)) {
      for (boolean reviewed : List.of(false, true)) {
        var operation =
            new DayOverrideOperation(
                10L,
                DATE,
                field,
                action,
                action == OverrideAction.SET ? chosen : null,
                before,
                DayFieldResolver.hash(before),
                BASE,
                ConflictState.KEPT,
                DayFieldResolver.hash(reviewed ? after : before),
                20L);
        var changed = new EnumMap<>(baseline());
        changed.put(field, after);
        var result =
            DayFieldResolver.resolve(
                    DATE,
                    changed,
                    BASE,
                    List.of(
                        new OverrideLayer(
                            SourceLayer.PERSONAL_OVERRIDE,
                            1L,
                            "system-cn",
                            "2",
                            List.of(operation))))
                .get(field);
        assertThat(result.value())
            .isEqualTo(
                action == OverrideAction.SET
                    ? chosen
                    : DayFieldValue.empty(field, FieldValueState.CLEARED));
        assertThat(result.conflictState())
            .isEqualTo(reviewed ? ConflictState.KEPT : ConflictState.NEEDS_REVIEW);
        assertThat(result.conflictId()).isEqualTo(20L);
      }
    }
  }

  private static DayFieldValue selectedValue(DayField field, int choice, int layer) {
    return choice == 1
        ? value(field, layer + 1)
        : DayFieldValue.empty(field, FieldValueState.CLEARED);
  }

  private static Map<DayField, DayFieldValue> baseline() {
    EnumMap<DayField, DayFieldValue> values = new EnumMap<>(DayField.class);
    for (DayField field : DayField.values()) values.put(field, value(field, 0));
    return values;
  }

  private static DayFieldValue value(DayField field, int index) {
    return switch (field) {
      case LUNAR_DATE ->
          DayFieldValue.lunar(new LunarDateValue(2026, 1, index + 1, false, "日期-" + index));
      case ZODIAC -> DayFieldValue.zodiac(Zodiac.values()[index]);
      case SOLAR_TERM -> DayFieldValue.solarTerm(SolarTerm.values()[index]);
      case DAY_POLICY ->
          DayFieldValue.dayPolicy(new DayPolicyValue(DayClassification.CUSTOM_REST, "规则-" + index));
      case DISPLAY_LABEL, DISPLAY_NOTE -> DayFieldValue.text(field, "值-" + index);
    };
  }
}
