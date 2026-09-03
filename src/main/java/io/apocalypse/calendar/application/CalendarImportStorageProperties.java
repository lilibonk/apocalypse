package io.apocalypse.calendar.application;

import jakarta.validation.constraints.Min;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.validation.annotation.Validated;

import lombok.Getter;
import lombok.Setter;

/** Calendar 离线导入的累计持久化配额。 */
@Getter
@Setter
@Validated
@Component
@ConfigurationProperties("apocalypse.calendar.import-storage")
class CalendarImportStorageProperties {

  @Min(1)
  private long totalBytes = 20L * 1024 * 1024 * 1024;

  @Min(1)
  private long uploaderBytes = 2L * 1024 * 1024 * 1024;

  @Min(1)
  private long targetBytes = 10L * 1024 * 1024 * 1024;
}
