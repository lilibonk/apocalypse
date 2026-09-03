package io.apocalypse.calendar.infrastructure.importing;

import io.apocalypse.calendar.domain.DataImportParseRequest;
import io.apocalypse.calendar.domain.DataImportTarget;
import io.apocalypse.calendar.domain.DayClassification;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class CommonsCsvDataImportParserTest {

  private final CommonsCsvDataImportParser parser = new CommonsCsvDataImportParser();

  @Test
  void parsesBomAndRfc4180QuotedNewlineIntoStableRows() {
    String csv =
        "\ufeffdate,action,classification,name,source_document_no,note\r\n"
            + "2027-01-01,SET,OFFICIAL_REST,元旦,国办发明电〔2026〕1号,\"两行\r\n说明\"\r\n";

    var result =
        parser.parse(
            new DataImportParseRequest(
                csv.getBytes(StandardCharsets.UTF_8),
                DataImportTarget.SYSTEM_BASELINE,
                2027,
                "国办发明电〔2026〕1号"));

    assertThat(result.validation().valid()).isTrue();
    assertThat(result.validation().rowCount()).isEqualTo(1);
    assertThat(result.rows().getFirst().classification())
        .isEqualTo(DayClassification.OFFICIAL_REST);
    assertThat(result.rows().getFirst().note()).isEqualTo("两行\r\n说明");
    assertThat(result.normalizedPayloadHash()).matches("[0-9a-f]{64}");
  }

  @Test
  void rejectsDuplicateDatesAndWrongManagedClassification() {
    String csv =
        "date,action,classification,name,source_document_no,note\r\n"
            + "2027-01-01,SET,OFFICIAL_REST,元旦,,\r\n"
            + "2027-01-01,SET,CUSTOM_REST,重复,,\r\n";

    var result =
        parser.parse(
            new DataImportParseRequest(
                csv.getBytes(StandardCharsets.UTF_8),
                DataImportTarget.MANAGED_OVERRIDE,
                2027,
                null));

    assertThat(result.validation().valid()).isFalse();
    assertThat(result.validation().issues())
        .extracting("errorCode")
        .contains("CSV_MANAGED_CLASSIFICATION", "CSV_DUPLICATE_DATE");
  }

  @Test
  void rejectsMalformedUtf8WithoutReplacementCharacters() {
    byte[] bytes = {(byte) 0xc3, (byte) 0x28};

    var result =
        parser.parse(
            new DataImportParseRequest(bytes, DataImportTarget.MANAGED_OVERRIDE, 2027, null));

    assertThat(result.validation().valid()).isFalse();
    assertThat(result.validation().issues().getFirst().errorCode()).isEqualTo("CSV_ENCODING");
  }
}
