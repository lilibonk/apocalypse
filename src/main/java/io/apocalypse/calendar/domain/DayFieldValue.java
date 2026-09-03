package io.apocalypse.calendar.domain;

import java.util.Objects;

/** 六种可覆盖字段的强类型值 envelope；非 VALUE 状态不允许携带值。 */
public record DayFieldValue(
    DayField field,
    LunarDateValue lunarDate,
    Zodiac zodiac,
    SolarTerm solarTerm,
    DayPolicyValue dayPolicy,
    String text,
    FieldValueState state) {

  public DayFieldValue {
    Objects.requireNonNull(field);
    Objects.requireNonNull(state);
    int valueSlots =
        count(lunarDate) + count(zodiac) + count(solarTerm) + count(dayPolicy) + count(text);
    if (state == FieldValueState.VALUE) {
      if (valueSlots != 1 || !matchesField(field, lunarDate, zodiac, solarTerm, dayPolicy, text)) {
        throw new IllegalArgumentException("字段值必须且只能使用匹配的值槽");
      }
    } else if (valueSlots != 0) {
      throw new IllegalArgumentException("非 VALUE 字段状态不能携带值");
    }
  }

  public static DayFieldValue lunar(LunarDateValue value) {
    return new DayFieldValue(
        DayField.LUNAR_DATE,
        Objects.requireNonNull(value),
        null,
        null,
        null,
        null,
        FieldValueState.VALUE);
  }

  public static DayFieldValue zodiac(Zodiac value) {
    return new DayFieldValue(
        DayField.ZODIAC,
        null,
        Objects.requireNonNull(value),
        null,
        null,
        null,
        FieldValueState.VALUE);
  }

  public static DayFieldValue solarTerm(SolarTerm value) {
    return new DayFieldValue(
        DayField.SOLAR_TERM,
        null,
        null,
        Objects.requireNonNull(value),
        null,
        null,
        FieldValueState.VALUE);
  }

  public static DayFieldValue dayPolicy(DayPolicyValue value) {
    return new DayFieldValue(
        DayField.DAY_POLICY,
        null,
        null,
        null,
        Objects.requireNonNull(value),
        null,
        FieldValueState.VALUE);
  }

  public static DayFieldValue text(DayField field, String value) {
    if (field != DayField.DISPLAY_LABEL && field != DayField.DISPLAY_NOTE) {
      throw new IllegalArgumentException("文本值只适用于展示标签或说明");
    }
    return new DayFieldValue(
        field, null, null, null, null, Objects.requireNonNull(value), FieldValueState.VALUE);
  }

  public static DayFieldValue empty(DayField field, FieldValueState state) {
    if (state == FieldValueState.VALUE) {
      throw new IllegalArgumentException("VALUE 状态必须携带值");
    }
    return new DayFieldValue(field, null, null, null, null, null, state);
  }

  /** 不依赖 JSON 库的稳定哈希输入。 */
  public String canonicalForm() {
    return String.join(
        "|",
        field.name(),
        state.name(),
        lunarDate == null
            ? ""
            : lunarDate.year()
                + ":"
                + lunarDate.month()
                + ":"
                + lunarDate.day()
                + ":"
                + lunarDate.leapMonth()
                + ":"
                + lunarDate.displayText(),
        zodiac == null ? "" : zodiac.name(),
        solarTerm == null ? "" : solarTerm.name(),
        dayPolicy == null
            ? ""
            : dayPolicy.classification().name() + ":" + Objects.toString(dayPolicy.name(), ""),
        Objects.toString(text, ""));
  }

  private static int count(Object value) {
    return value == null ? 0 : 1;
  }

  private static boolean matchesField(
      DayField field,
      LunarDateValue lunarDate,
      Zodiac zodiac,
      SolarTerm solarTerm,
      DayPolicyValue dayPolicy,
      String text) {
    return switch (field) {
      case LUNAR_DATE -> lunarDate != null;
      case ZODIAC -> zodiac != null;
      case SOLAR_TERM -> solarTerm != null;
      case DAY_POLICY -> dayPolicy != null;
      case DISPLAY_LABEL, DISPLAY_NOTE -> text != null;
    };
  }
}
