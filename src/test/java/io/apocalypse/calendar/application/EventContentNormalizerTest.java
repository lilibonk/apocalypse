package io.apocalypse.calendar.application;

import io.apocalypse.calendar.domain.DstOffsetChoice;
import io.apocalypse.calendar.domain.EventContent;
import io.apocalypse.calendar.domain.EventTimeKind;
import io.apocalypse.calendar.interfaces.dto.request.EventContentReq;
import io.apocalypse.common.exception.BizException;

import java.time.LocalDateTime;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class EventContentNormalizerTest {

  private final EventContentNormalizer normalizer = new EventContentNormalizer();

  @Test
  void rejectsDstGap() {
    EventContentReq request =
        timed(LocalDateTime.of(2026, 3, 8, 2, 30), LocalDateTime.of(2026, 3, 8, 4, 0), null, null);

    assertThatThrownBy(() -> normalizer.normalize(request))
        .isInstanceOfSatisfying(
            BizException.class, error -> assertThat(error.getCode()).isEqualTo(11004));
  }

  @Test
  void requiresChoiceForDstOverlapAndPersistsDistinctInstants() {
    LocalDateTime local = LocalDateTime.of(2026, 11, 1, 1, 30);
    EventContentReq ambiguous = timed(local, LocalDateTime.of(2026, 11, 1, 3, 0), null, null);
    assertThatThrownBy(() -> normalizer.normalize(ambiguous))
        .isInstanceOfSatisfying(
            BizException.class, error -> assertThat(error.getCode()).isEqualTo(11005));

    EventContent earlier =
        normalizer.normalize(
            timed(local, LocalDateTime.of(2026, 11, 1, 3, 0), DstOffsetChoice.EARLIER, null));
    EventContent later =
        normalizer.normalize(
            timed(local, LocalDateTime.of(2026, 11, 1, 3, 0), DstOffsetChoice.LATER, null));

    assertThat(later.startAtUtc()).isEqualTo(earlier.startAtUtc().plusHours(1));
  }

  private static EventContentReq timed(
      LocalDateTime start,
      LocalDateTime end,
      DstOffsetChoice startChoice,
      DstOffsetChoice endChoice) {
    return new EventContentReq(
        "测试日程",
        null,
        null,
        EventTimeKind.TIMED,
        null,
        null,
        start,
        end,
        "America/New_York",
        startChoice,
        endChoice);
  }
}
