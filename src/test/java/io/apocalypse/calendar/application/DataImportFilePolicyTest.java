package io.apocalypse.calendar.application;

import io.apocalypse.common.exception.BizException;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DataImportFilePolicyTest {

  @Test
  void rejectsNativeOfficeArchiveEvenWhenRenamedToCsv() {
    byte[] zip = {'P', 'K', 3, 4, 0, 0};

    assertThatThrownBy(
            () -> DataImportFilePolicy.data(new ImportUploadFile("annual.csv", "text/csv", zip)))
        .isInstanceOf(BizException.class)
        .extracting("code")
        .isEqualTo(11016);
  }

  @Test
  void rejectsEvidenceWhoseMagicDoesNotMatchItsExtension() {
    byte[] text = "not a pdf".getBytes(StandardCharsets.UTF_8);

    assertThatThrownBy(
            () ->
                DataImportFilePolicy.evidence(
                    new ImportUploadFile("notice.pdf", "application/pdf", text)))
        .isInstanceOf(BizException.class)
        .extracting("code")
        .isEqualTo(11016);
  }
}
