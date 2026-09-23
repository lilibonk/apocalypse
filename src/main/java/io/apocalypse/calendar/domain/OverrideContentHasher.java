package io.apocalypse.calendar.domain;

import java.util.Comparator;
import java.util.List;

public final class OverrideContentHasher {

  private OverrideContentHasher() {}

  public static String hash(List<DayOverrideOperation> operations) {
    List<DayOverrideOperation> sorted =
        operations.stream()
            .sorted(
                Comparator.comparing(DayOverrideOperation::date)
                    .thenComparing(operation -> operation.field().name()))
            .toList();
    CanonicalContentHash hash =
        new CanonicalContentHash("calendar-override-content:v2").add(sorted.size());
    for (DayOverrideOperation operation : sorted) {
      hash.add(operation.date()).add(operation.field()).add(operation.action());
      addValue(hash, operation.value());
      addValue(hash, operation.savedUnderlay());
      hash.add(operation.savedUnderlayHash())
          .add(operation.savedUnderlaySource().layer())
          .add(
              operation.savedUnderlaySource().layer() == SourceLayer.SYSTEM_DATASET
                  ? operation.savedUnderlaySource().sourceVersion()
                  : operation.savedUnderlaySource().sourceCalendarKey())
          .add(operation.savedUnderlaySource().sourceVersion());
    }
    return hash.finish();
  }

  private static void addValue(CanonicalContentHash hash, DayFieldValue value) {
    hash.add(value != null);
    if (value == null) {
      return;
    }
    LunarDateValue lunar = value.lunarDate();
    DayPolicyValue policy = value.dayPolicy();
    hash.add(value.field())
        .add(value.state())
        .add(lunar == null ? null : lunar.year())
        .add(lunar == null ? null : lunar.month())
        .add(lunar == null ? null : lunar.day())
        .add(lunar == null ? null : lunar.leapMonth())
        .add(lunar == null ? null : lunar.displayText())
        .add(value.zodiac())
        .add(value.solarTerm())
        .add(policy == null ? null : policy.classification())
        .add(policy == null ? null : policy.name())
        .add(value.text());
  }
}
