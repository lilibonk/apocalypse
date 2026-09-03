package io.apocalypse.calendar.infrastructure.date;

import io.apocalypse.calendar.domain.DateKnowledgeProvider;
import io.apocalypse.calendar.domain.DateProviderDescriptor;
import io.apocalypse.calendar.domain.LunarDateValue;
import io.apocalypse.calendar.domain.RawDateKnowledge;
import io.apocalypse.calendar.domain.SolarTerm;
import io.apocalypse.calendar.domain.Zodiac;

import java.time.LocalDate;
import java.util.Map;

import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import com.nlf.calendar.Lunar;
import com.nlf.calendar.Solar;

/** lunar-java 适配器；只使用农历日期、年生肖和当日节气，不调用库内 HolidayUtil 或黄历能力。 */
@Component
public class LunarDateKnowledgeProvider implements DateKnowledgeProvider {

  public static final LocalDate SUPPORTED_FROM = LocalDate.of(1901, 1, 1);

  public static final LocalDate SUPPORTED_TO = LocalDate.of(2100, 12, 31);

  private static final DateProviderDescriptor DESCRIPTOR =
      new DateProviderDescriptor(
          "lunar-java",
          "1.7.7",
          "0c4c3a827333b3e2fd25b411e9067398f58aeb98b1e828e93ba25ba8b7051659",
          SUPPORTED_FROM,
          SUPPORTED_TO);

  private static final Map<String, Zodiac> ZODIACS =
      Map.ofEntries(
          Map.entry("鼠", Zodiac.RAT),
          Map.entry("牛", Zodiac.OX),
          Map.entry("虎", Zodiac.TIGER),
          Map.entry("兔", Zodiac.RABBIT),
          Map.entry("龙", Zodiac.DRAGON),
          Map.entry("蛇", Zodiac.SNAKE),
          Map.entry("马", Zodiac.HORSE),
          Map.entry("羊", Zodiac.GOAT),
          Map.entry("猴", Zodiac.MONKEY),
          Map.entry("鸡", Zodiac.ROOSTER),
          Map.entry("狗", Zodiac.DOG),
          Map.entry("猪", Zodiac.PIG));

  private static final Map<String, SolarTerm> SOLAR_TERMS =
      Map.ofEntries(
          Map.entry("小寒", SolarTerm.MINOR_COLD),
          Map.entry("大寒", SolarTerm.MAJOR_COLD),
          Map.entry("立春", SolarTerm.START_OF_SPRING),
          Map.entry("雨水", SolarTerm.RAIN_WATER),
          Map.entry("惊蛰", SolarTerm.AWAKENING_OF_INSECTS),
          Map.entry("春分", SolarTerm.SPRING_EQUINOX),
          Map.entry("清明", SolarTerm.PURE_BRIGHTNESS),
          Map.entry("谷雨", SolarTerm.GRAIN_RAIN),
          Map.entry("立夏", SolarTerm.START_OF_SUMMER),
          Map.entry("小满", SolarTerm.GRAIN_FULL),
          Map.entry("芒种", SolarTerm.GRAIN_IN_EAR),
          Map.entry("夏至", SolarTerm.SUMMER_SOLSTICE),
          Map.entry("小暑", SolarTerm.MINOR_HEAT),
          Map.entry("大暑", SolarTerm.MAJOR_HEAT),
          Map.entry("立秋", SolarTerm.START_OF_AUTUMN),
          Map.entry("处暑", SolarTerm.END_OF_HEAT),
          Map.entry("白露", SolarTerm.WHITE_DEW),
          Map.entry("秋分", SolarTerm.AUTUMN_EQUINOX),
          Map.entry("寒露", SolarTerm.COLD_DEW),
          Map.entry("霜降", SolarTerm.FROST_DESCENT),
          Map.entry("立冬", SolarTerm.START_OF_WINTER),
          Map.entry("小雪", SolarTerm.MINOR_SNOW),
          Map.entry("大雪", SolarTerm.MAJOR_SNOW),
          Map.entry("冬至", SolarTerm.WINTER_SOLSTICE));

  @Override
  public DateProviderDescriptor descriptor() {
    return DESCRIPTOR;
  }

  @Override
  public RawDateKnowledge resolve(LocalDate date) {
    if (date == null) {
      throw new IllegalArgumentException("日期不能为空");
    }
    if (date.isBefore(SUPPORTED_FROM) || date.isAfter(SUPPORTED_TO)) {
      return RawDateKnowledge.unsupported(date);
    }
    Lunar lunar =
        Solar.fromYmd(date.getYear(), date.getMonthValue(), date.getDayOfMonth()).getLunar();
    int rawMonth = lunar.getMonth();
    LunarDateValue lunarDate =
        new LunarDateValue(
            lunar.getYear(),
            Math.abs(rawMonth),
            lunar.getDay(),
            rawMonth < 0,
            lunar.getYearInChinese()
                + "年"
                + (rawMonth < 0 ? "闰" : "")
                + lunar.getMonthInChinese()
                + "月"
                + lunar.getDayInChinese());
    return new RawDateKnowledge(
        date,
        true,
        lunarDate,
        requireMapping(ZODIACS, lunar.getYearShengXiao(), "生肖"),
        mapSolarTerm(lunar.getJieQi()));
  }

  private static SolarTerm mapSolarTerm(String name) {
    if (!StringUtils.hasText(name)) {
      return null;
    }
    return requireMapping(SOLAR_TERMS, name, "节气");
  }

  private static <T> T requireMapping(Map<String, T> mappings, String value, String type) {
    T mapped = mappings.get(value);
    if (mapped == null) {
      throw new IllegalStateException("lunar-java 返回未知" + type + ": " + value);
    }
    return mapped;
  }
}
