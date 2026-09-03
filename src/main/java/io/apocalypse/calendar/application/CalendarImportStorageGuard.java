package io.apocalypse.calendar.application;

import io.apocalypse.calendar.domain.DataImportStorageUsage;
import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;

import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

/** 在导入存储事务锁内执行的三层配额守卫。 */
@Component
@RequiredArgsConstructor
class CalendarImportStorageGuard {

  private final CalendarImportStorageProperties properties;

  void requireCapacity(DataImportStorageUsage usage, long incomingBytes) {
    if (incomingBytes < 1
        || exceeds(usage.totalChargeBytes(), incomingBytes, properties.getTotalBytes())
        || exceeds(usage.uploaderChargeBytes(), incomingBytes, properties.getUploaderBytes())
        || exceeds(usage.targetChargeBytes(), incomingBytes, properties.getTargetBytes())) {
      throw new BizException(ErrorCode.CONFLICT.getCode(), "日历导入存储配额不足");
    }
  }

  private static boolean exceeds(long usedBytes, long incomingBytes, long limitBytes) {
    return usedBytes < 0 || usedBytes > limitBytes || incomingBytes > limitBytes - usedBytes;
  }
}
