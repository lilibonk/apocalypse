package io.apocalypse;

import io.apocalypse.calendar.application.DataImportService;
import io.apocalypse.calendar.application.ImportUploadFile;
import io.apocalypse.calendar.domain.DataImportTarget;
import io.apocalypse.calendar.domain.ImportAssuranceLevel;
import io.apocalypse.calendar.domain.ImportSourceClaim;
import io.apocalypse.calendar.interfaces.dto.request.DataImportCreateReq;
import io.apocalypse.common.exception.BizException;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "apocalypse.capabilities.calendar.enabled=true",
      "apocalypse.calendar.import-storage.total-bytes=1099511627776",
      "apocalypse.calendar.import-storage.uploader-bytes=1048577",
      "apocalypse.calendar.import-storage.target-bytes=1099511627776"
    })
class CalendarImportStorageQuotaIT extends AbstractIntegrationTest {

  private static final long UPLOADER_ID = 9601L;

  private static final String UPLOADER = "calendar_quota_uploader";

  @Autowired private DataImportService dataImportService;

  @Test
  void concurrentUploadsCannotOverdrawUploaderQuota() throws Exception {
    jdbcTemplate.update(
        """
        INSERT INTO sys_user
            (id, username, password, nickname, status, create_by, update_by)
        SELECT ?, ?, password, '配额并发测试', 1, 'test', 'test'
        FROM sys_user WHERE id = 1
        """,
        UPLOADER_ID,
        UPLOADER);

    int attempts = 8;
    CountDownLatch start = new CountDownLatch(1);
    ExecutorService executor = Executors.newFixedThreadPool(attempts);
    try {
      List<Future<Integer>> results = new ArrayList<>();
      for (int index = 0; index < attempts; index++) {
        int value = index;
        results.add(
            executor.submit(
                () -> {
                  start.await();
                  try {
                    upload(value);
                    return 0;
                  } catch (BizException error) {
                    return error.getCode();
                  }
                }));
      }

      start.countDown();
      List<Integer> codes = new ArrayList<>();
      for (Future<Integer> result : results) {
        codes.add(result.get());
      }

      assertThat(codes).containsOnly(0, 40900);
      assertThat(codes.stream().filter(code -> code == 0)).hasSize(1);
      assertThat(codes.stream().filter(code -> code == 40900)).hasSize(attempts - 1);
      assertThat(
              jdbcTemplate.queryForObject(
                  "SELECT count(*) FROM cal_data_import WHERE uploader_user_id = ?",
                  Long.class,
                  UPLOADER_ID))
          .isEqualTo(1L);
    } finally {
      executor.shutdownNow();
    }
  }

  private void upload(int index) {
    String suffix = Integer.toString(index);
    dataImportService.upload(
        new DataImportCreateReq(
            "quota-concurrent-" + suffix,
            DataImportTarget.SYSTEM_BASELINE,
            null,
            "CN",
            2027,
            ImportSourceClaim.OFFICIAL_NOTICE,
            ImportAssuranceLevel.OFFLINE_DOCUMENT_REVIEWED,
            "配额测试文号-" + suffix,
            "配额并发测试通知",
            "测试签发单位",
            LocalDate.of(2026, 12, 1),
            null),
        new ImportUploadFile(
            "quota-" + suffix + ".csv",
            "text/csv",
            String.valueOf((char) ('A' + index)).getBytes(StandardCharsets.UTF_8)),
        null,
        UPLOADER_ID,
        UPLOADER);
  }
}
