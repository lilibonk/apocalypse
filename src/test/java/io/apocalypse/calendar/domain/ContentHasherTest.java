package io.apocalypse.calendar.domain;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ContentHasherTest {

  @Test
  void eventFieldsCannotBeShiftedAcrossDelimiterBoundaries() {
    EventContent reviewed = event("Meeting", "Agenda|Room 101", "HQ");
    EventContent substituted = event("Meeting|Agenda", "Room 101", "HQ");
    assertThat(EventContentHasher.hash(reviewed))
        .isNotEqualTo(EventContentHasher.hash(substituted))
        .isEqualTo(EventContentHasher.hash(reviewed))
        .matches("[0-9a-f]{64}");
  }

  @Test
  void eventNullEmptyAndUnpairedUnicodeCodeUnitsRemainDistinct() {
    assertThat(EventContentHasher.hash(event("会议 🌙\n|", null, "")))
        .isNotEqualTo(EventContentHasher.hash(event("会议 🌙\n|", "", "")));
    assertThat(EventContentHasher.hash(event("Meeting", "\uD800", "HQ")))
        .isNotEqualTo(EventContentHasher.hash(event("Meeting", "\uD801", "HQ")));
  }

  @Test
  void timedContentHashUsesThePersistedMicrosecondPrecisionIncludingRollover() {
    LocalDateTime boundary = LocalDateTime.of(2026, 9, 22, 23, 59, 59);
    assertThat(EventContentHasher.hash(timed(boundary.withNano(123_456_499))))
        .isEqualTo(EventContentHasher.hash(timed(boundary.withNano(123_456_000))));
    assertThat(EventContentHasher.hash(timed(boundary.withNano(123_456_500))))
        .isEqualTo(EventContentHasher.hash(timed(boundary.withNano(123_457_000))));
    assertThat(EventContentHasher.hash(timed(boundary.withNano(999_999_500))))
        .isEqualTo(EventContentHasher.hash(timed(boundary.plusSeconds(1))));
  }

  @Test
  void noteCannotEmbedAdditionalOverrideRows() {
    LocalDate first = LocalDate.of(2026, 9, 22);
    LocalDate second = first.plusDays(1);
    DayOverrideOperation noteA = note(first, "x");
    DayOverrideOperation policy =
        operation(
            second,
            DayFieldValue.dayPolicy(new DayPolicyValue(DayClassification.CUSTOM_REST, "Rest")));
    DayOverrideOperation noteB = note(second, "y");
    List<DayOverrideOperation> reviewed = List.of(noteA, policy, noteB);
    String firstRow = legacyRow(noteA);
    int textStart = firstRow.indexOf("|x|") + 1;
    String suffix = firstRow.substring(textStart + 1);
    String oldCanonical = firstRow + "\n" + legacyRow(policy) + "\n" + legacyRow(noteB);
    String injected = oldCanonical.substring(textStart, oldCanonical.length() - suffix.length());
    DayOverrideOperation substituted = note(first, injected);

    assertThat(injected.length()).isLessThanOrEqualTo(500);
    assertThat(legacyRow(substituted)).isEqualTo(oldCanonical);
    assertThat(OverrideContentHasher.hash(reviewed))
        .isNotEqualTo(OverrideContentHasher.hash(List.of(substituted)))
        .isEqualTo(OverrideContentHasher.hash(List.of(noteB, noteA, policy)));
  }

  @Test
  void nestedPolicyTextCannotShiftIntoUnderlayFields() {
    DayOverrideOperation ordinary =
        operation(
            LocalDate.of(2026, 9, 22),
            DayFieldValue.dayPolicy(new DayPolicyValue(DayClassification.CUSTOM_REST, "|\nRest")));
    DayOverrideOperation changed =
        operation(
            ordinary.date(),
            DayFieldValue.dayPolicy(new DayPolicyValue(DayClassification.CUSTOM_REST, "Rest|\n")));
    assertThat(OverrideContentHasher.hash(List.of(ordinary)))
        .isNotEqualTo(OverrideContentHasher.hash(List.of(changed)))
        .isEqualTo(OverrideContentHasher.hash(List.of(ordinary)));
  }

  private static EventContent event(String title, String description, String location) {
    return new EventContent(
        title,
        description,
        location,
        EventTimeKind.ALL_DAY,
        LocalDate.of(2026, 10, 1),
        LocalDate.of(2026, 10, 2),
        null,
        null,
        null);
  }

  private static EventContent timed(LocalDateTime start) {
    return new EventContent(
        "Timed meeting",
        null,
        null,
        EventTimeKind.TIMED,
        null,
        null,
        start,
        start.plusHours(1),
        "UTC");
  }

  private static DayOverrideOperation note(LocalDate date, String text) {
    return operation(date, DayFieldValue.text(DayField.DISPLAY_NOTE, text));
  }

  private static DayOverrideOperation operation(LocalDate date, DayFieldValue value) {
    DayFieldValue underlay = DayFieldValue.empty(value.field(), FieldValueState.CLEARED);
    return new DayOverrideOperation(
        null,
        date,
        value.field(),
        OverrideAction.SET,
        value,
        underlay,
        "underlay",
        new DayFieldSource(SourceLayer.SYSTEM_DATASET, null, "CN", "v1", OverrideAction.BASE),
        ConflictState.NONE,
        null,
        null);
  }

  private static String legacyRow(DayOverrideOperation operation) {
    return String.join(
        "|",
        operation.date().toString(),
        operation.field().name(),
        operation.action().name(),
        operation.value() == null ? "" : operation.value().canonicalForm(),
        operation.savedUnderlay().canonicalForm(),
        operation.savedUnderlayHash(),
        operation.savedUnderlaySource().layer().name(),
        Objects.toString(operation.savedUnderlaySource().sourceCalendarKey(), ""),
        Objects.toString(operation.savedUnderlaySource().sourceVersion(), ""));
  }
}
