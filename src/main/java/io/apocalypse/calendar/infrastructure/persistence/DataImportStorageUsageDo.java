package io.apocalypse.calendar.infrastructure.persistence;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class DataImportStorageUsageDo {

  private Long totalChargeBytes;

  private Long uploaderChargeBytes;

  private Long targetChargeBytes;
}
