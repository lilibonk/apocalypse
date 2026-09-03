package io.apocalypse.calendar.infrastructure.date;

import io.apocalypse.calendar.domain.SolarTerm;
import io.apocalypse.calendar.domain.Zodiac;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class LunarDateKnowledgeProviderTest {

  private final LunarDateKnowledgeProvider provider = new LunarDateKnowledgeProvider();

  @Test
  void resolvesSpringFestivalLeapMonthAndSolarTerms() {
    var springFestival = provider.resolve(LocalDate.of(2024, 2, 10));
    assertThat(springFestival.supported()).isTrue();
    assertThat(springFestival.lunarDate().year()).isEqualTo(2024);
    assertThat(springFestival.lunarDate().month()).isEqualTo(1);
    assertThat(springFestival.lunarDate().day()).isEqualTo(1);
    assertThat(springFestival.lunarDate().leapMonth()).isFalse();
    assertThat(springFestival.zodiac()).isEqualTo(Zodiac.DRAGON);

    var leapMonth = provider.resolve(LocalDate.of(2023, 3, 22));
    assertThat(leapMonth.lunarDate().month()).isEqualTo(2);
    assertThat(leapMonth.lunarDate().day()).isEqualTo(1);
    assertThat(leapMonth.lunarDate().leapMonth()).isTrue();

    assertThat(provider.resolve(LocalDate.of(2024, 4, 4)).solarTerm())
        .isEqualTo(SolarTerm.PURE_BRIGHTNESS);
    assertThat(provider.resolve(LocalDate.of(2024, 12, 21)).solarTerm())
        .isEqualTo(SolarTerm.WINTER_SOLSTICE);
  }

  @Test
  void enforcesProductRangeWithoutTrustingLibraryTheoreticalRange() {
    assertThat(provider.resolve(LocalDate.of(1901, 1, 1)).supported()).isTrue();
    assertThat(provider.resolve(LocalDate.of(2100, 12, 31)).supported()).isTrue();

    var unsupported = provider.resolve(LocalDate.of(2101, 1, 1));
    assertThat(unsupported.supported()).isFalse();
    assertThat(unsupported.lunarDate()).isNull();
    assertThat(unsupported.zodiac()).isNull();
    assertThat(unsupported.solarTerm()).isNull();
  }
}
