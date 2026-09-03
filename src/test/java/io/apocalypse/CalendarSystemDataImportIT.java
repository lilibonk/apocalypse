package io.apocalypse;

import io.apocalypse.calendar.application.DataImportService;
import io.apocalypse.calendar.application.DateQueryService;
import io.apocalypse.calendar.application.ImportUploadFile;
import io.apocalypse.calendar.domain.DataImportTarget;
import io.apocalypse.calendar.domain.ImportAssuranceLevel;
import io.apocalypse.calendar.domain.ImportSourceClaim;
import io.apocalypse.calendar.interfaces.dto.request.DataImportCreateReq;
import io.apocalypse.calendar.interfaces.dto.request.DataImportPublishReq;
import io.apocalypse.calendar.interfaces.dto.request.DataImportReviewReq;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;

@Transactional
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "apocalypse.capabilities.calendar.enabled=true")
class CalendarSystemDataImportIT extends AbstractIntegrationTest {

  @Autowired private DataImportService dataImportService;

  @Autowired private DateQueryService dateQueryService;

  @Test
  void reviewedOfflineNoticePublishesSystemCorrectionAndProvenanceWithoutNetwork() {
    Long adminId =
        jdbcTemplate.queryForObject(
            "SELECT id FROM sys_user WHERE username = 'admin' AND deleted = 0", Long.class);
    String documentNo = "国办发明电〔2026〕测试号";
    byte[] csv =
        ("date,action,classification,name,source_document_no,note\r\n"
                + "2027-01-01,SET,OFFICIAL_REST,元旦,"
                + documentNo
                + ",离线通知测试\r\n")
            .getBytes(StandardCharsets.UTF_8);
    var uploaded =
        dataImportService.upload(
            new DataImportCreateReq(
                "system-" + UUID.randomUUID().toString().substring(0, 8),
                DataImportTarget.SYSTEM_BASELINE,
                null,
                "CN",
                2027,
                ImportSourceClaim.OFFICIAL_NOTICE,
                ImportAssuranceLevel.OFFLINE_DOCUMENT_REVIEWED,
                documentNo,
                "2027 年节假日安排测试通知",
                "国务院办公厅",
                LocalDate.of(2026, 11, 1),
                null),
            new ImportUploadFile("2027.csv", "text/csv", csv),
            null,
            adminId,
            "admin");
    var validated = dataImportService.validate(uploaded.id(), adminId, "admin");
    assertThat(validated.validation().valid()).isTrue();
    var reviewed =
        dataImportService.review(
            uploaded.id(),
            new DataImportReviewReq(
                validated.version(),
                validated.dataFile().sha256(),
                validated.normalizedPayloadHash(),
                true,
                "已核对离线通知文号与原始表格"),
            adminId,
            "admin");
    var published =
        dataImportService.publish(
            uploaded.id(),
            new DataImportPublishReq(
                reviewed.version(),
                reviewed.normalizedPayloadHash(),
                reviewed.diff().targetContentHash()),
            adminId,
            "admin");

    assertThat(published.publishedReleaseId()).isNotNull();
    var day = dateQueryService.detail(1L, LocalDate.of(2027, 1, 1), null, adminId, false);
    assertThat(day.baselineRef().publishedHolidayYears()).contains(2027);
    assertThat(day.effective().dayPolicy().classification().name()).isEqualTo("OFFICIAL_REST");
    assertThat(day.effective().dayPolicy().name()).isEqualTo("元旦");
    assertThat(day.resolutions().toString()).contains("SYSTEM_CORRECTION");
  }
}
