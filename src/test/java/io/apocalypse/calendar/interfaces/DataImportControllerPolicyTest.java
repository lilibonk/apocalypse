package io.apocalypse.calendar.interfaces;

import io.apocalypse.calendar.interfaces.dto.request.DataImportCreateReq;
import io.apocalypse.framework.ratelimit.RateLimit;

import org.junit.jupiter.api.Test;
import org.springframework.web.multipart.MultipartFile;

import static org.assertj.core.api.Assertions.assertThat;

class DataImportControllerPolicyTest {

  @Test
  void uploadDeclaresDedicatedBurstRateLimit() throws Exception {
    RateLimit policy =
        DataImportController.class
            .getDeclaredMethod(
                "upload", DataImportCreateReq.class, MultipartFile.class, MultipartFile.class)
            .getAnnotation(RateLimit.class);

    assertThat(policy).isNotNull();
    assertThat(policy.key()).isEqualTo("calendar-data-import-upload");
    assertThat(policy.limit()).isEqualTo(6);
    assertThat(policy.windowSeconds()).isEqualTo(60);
  }
}
