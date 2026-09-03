package io.apocalypse.calendar.domain;

import java.time.LocalDate;

/** 系统原始日期知识；超出产品范围时仅保留公历日期并显式标为不支持。 */
public record RawDateKnowledge(
    LocalDate date,
    boolean supported,
    LunarDateValue lunarDate,
    Zodiac zodiac,
    SolarTerm solarTerm) {

  public static RawDateKnowledge unsupported(LocalDate date) {
    return new RawDateKnowledge(date, false, null, null, null);
  }
}
