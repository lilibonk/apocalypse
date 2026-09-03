package io.apocalypse.calendar.infrastructure.date;

import io.apocalypse.calendar.domain.DayClassification;

import java.time.LocalDate;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

import tools.jackson.databind.ObjectMapper;

class ClasspathHolidayPolicyProviderTest {

  private final ClasspathHolidayPolicyProvider provider =
      new ClasspathHolidayPolicyProvider(new ObjectMapper());

  @Test
  void resolvesOfficialRestAdjustedWorkdayAndOrdinaryWeekdaysFromPublishedYears() {
    var springFestival = provider.resolve(LocalDate.of(2026, 2, 17));
    assertThat(springFestival.published()).isTrue();
    assertThat(springFestival.policy().classification()).isEqualTo(DayClassification.OFFICIAL_REST);
    assertThat(springFestival.policy().name()).isEqualTo("春节");

    var adjustedWorkday = provider.resolve(LocalDate.of(2026, 2, 14));
    assertThat(adjustedWorkday.published()).isTrue();
    assertThat(adjustedWorkday.policy().classification())
        .isEqualTo(DayClassification.ADJUSTED_WORKDAY);

    var ordinaryDay = provider.resolve(LocalDate.of(2026, 3, 2));
    assertThat(ordinaryDay.published()).isTrue();
    assertThat(ordinaryDay.policy().classification()).isEqualTo(DayClassification.NORMAL_WORKDAY);
    assertThat(ordinaryDay.policy().name()).isNull();
  }

  @Test
  void keepsYearsWithoutAnOfficialBundleExplicitlyUnpublished() {
    assertThat(provider.publishedYears()).containsExactly(2025, 2026);
    assertThat(provider.resolve(LocalDate.of(2024, 12, 31)).published()).isFalse();
    assertThat(provider.resolve(LocalDate.of(2024, 12, 31)).policy()).isNull();
    assertThat(provider.resolve(LocalDate.of(2027, 1, 1)).published()).isFalse();
    assertThat(provider.resolve(LocalDate.of(2027, 1, 1)).policy()).isNull();
  }

  @Test
  void everyDayInEachPublishedYearHasAnExplicitPublicationState() {
    Stream.of(2025, 2026)
        .flatMap(year -> LocalDate.of(year, 1, 1).datesUntil(LocalDate.of(year + 1, 1, 1)))
        .forEach(
            date -> {
              var knowledge = provider.resolve(date);
              assertThat(knowledge.published()).as("%s 应属于已发布年度", date).isTrue();
              assertThat(knowledge.policy()).as("%s 应有规范化日别", date).isNotNull();
            });
  }
}
