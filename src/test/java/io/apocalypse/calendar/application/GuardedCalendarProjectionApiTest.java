package io.apocalypse.calendar.application;

import io.apocalypse.calendar.api.CalendarErrorCode;
import io.apocalypse.calendar.api.ProjectionBatchCommand;
import io.apocalypse.common.exception.BizException;
import io.apocalypse.framework.capability.CapabilityProperties;
import io.apocalypse.framework.capability.CapabilityRegistry;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GuardedCalendarProjectionApiTest {

  @Test
  void disabledFacadeReturnsStableErrorBeforeResolvingHandler() {
    CapabilityRegistry registry = new CapabilityRegistry(new CapabilityProperties());
    CalendarCapabilityGuard guard = new CalendarCapabilityGuard(registry);
    var provider = new DefaultListableBeanFactory().getBeanProvider(ProjectionCommandHandler.class);
    GuardedCalendarProjectionApi api = new GuardedCalendarProjectionApi(guard, provider);

    assertThatThrownBy(() -> api.upsert(new ProjectionBatchCommand("campus", "school", List.of())))
        .isInstanceOfSatisfying(
            BizException.class,
            error ->
                assertThat(error.getCode())
                    .isEqualTo(CalendarErrorCode.CALENDAR_DISABLED.getCode()));
  }
}
