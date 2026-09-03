package io.apocalypse.calendar.application;

import io.apocalypse.calendar.domain.DataImportStorageUsage;
import io.apocalypse.common.exception.BizException;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CalendarImportStorageGuardTest {

  private CalendarImportStorageGuard guard;

  @BeforeEach
  void setUp() {
    CalendarImportStorageProperties properties = new CalendarImportStorageProperties();
    properties.setTotalBytes(100);
    properties.setUploaderBytes(60);
    properties.setTargetBytes(80);
    guard = new CalendarImportStorageGuard(properties);
  }

  @Test
  void exactQuotaBoundaryIsAllowed() {
    guard.requireCapacity(new DataImportStorageUsage(90, 50, 70), 10);
  }

  @Test
  void rejectsGlobalUploaderAndTargetOverflowIndependently() {
    assertQuotaRejected(new DataImportStorageUsage(91, 0, 0), 10);
    assertQuotaRejected(new DataImportStorageUsage(0, 51, 0), 10);
    assertQuotaRejected(new DataImportStorageUsage(0, 0, 71), 10);
  }

  @Test
  void rejectsInvalidOrAlreadyOverdrawnUsageWithoutOverflow() {
    assertQuotaRejected(new DataImportStorageUsage(0, 0, 0), 0);
    assertQuotaRejected(new DataImportStorageUsage(Long.MAX_VALUE, 0, 0), 1);
  }

  private void assertQuotaRejected(DataImportStorageUsage usage, long incomingBytes) {
    assertThatThrownBy(() -> guard.requireCapacity(usage, incomingBytes))
        .isInstanceOfSatisfying(
            BizException.class,
            error -> {
              assertThat(error.getCode()).isEqualTo(40900);
              assertThat(error.getMessage()).isEqualTo("日历导入存储配额不足");
            });
  }
}
