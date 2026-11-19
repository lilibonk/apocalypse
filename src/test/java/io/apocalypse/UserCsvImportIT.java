package io.apocalypse;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.util.LinkedMultiValueMap;

import static org.assertj.core.api.Assertions.assertThat;

class UserCsvImportIT extends AbstractIntegrationTest {

  @Test
  void commitsValidRowsAndReportsDuplicateAndInvalidDepartmentInOrder() {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);
    String prefix = "csv_" + UUID.randomUUID().toString().substring(0, 8);
    String csv =
        """
        username,nickname,password,deptId
        %1$s_first,First,CsvExample2026!,11
        %1$s_first,Duplicate,CsvExample2026!,11
        %1$s_invalid,Invalid,CsvExample2026!,999999
        %1$s_last,Last,CsvExample2026!,
        """
            .formatted(prefix);
    var parts = new LinkedMultiValueMap<String, Object>();
    parts.add(
        "file",
        new ByteArrayResource(csv.getBytes(StandardCharsets.UTF_8)) {
          @Override
          public String getFilename() {
            return "users.csv";
          }
        });
    var headers = new HttpHeaders();
    headers.setBearerAuth(token);
    headers.setContentType(MediaType.MULTIPART_FORM_DATA);

    try {
      var response =
          restTemplate.exchange(
              "/system/users/import",
              HttpMethod.POST,
              new HttpEntity<>(parts, headers),
              String.class);
      var result = objectMapper.readTree(response.getBody());
      assertThat(result.at("/code").asInt()).as("%s", result).isZero();
      assertThat(result.at("/data/totalRows").asInt()).isEqualTo(4);
      assertThat(result.at("/data/successCount").asInt()).isEqualTo(2);
      assertThat(result.at("/data/failureCount").asInt()).isEqualTo(2);
      assertThat(result.at("/data/errors/0").asText()).contains("第 3 行", "用户名已存在");
      assertThat(result.at("/data/errors/1").asText()).contains("第 4 行", "部门不存在或已停用");
      assertThat(
              jdbcTemplate.queryForList(
                  """
              SELECT username FROM sys_user WHERE left(username, ?) = ?
                AND create_by = 'admin' AND update_by = 'admin' AND version = 0 AND deleted = 0
              ORDER BY username
              """,
                  String.class,
                  prefix.length(),
                  prefix))
          .containsExactly(prefix + "_first", prefix + "_last");
      assertThat(
              jdbcTemplate.queryForObject(
                  "SELECT nickname FROM sys_user WHERE username = ?",
                  String.class,
                  prefix + "_first"))
          .isEqualTo("First");
    } finally {
      jdbcTemplate.update(
          "DELETE FROM sys_user WHERE left(username, ?) = ?", prefix.length(), prefix);
    }
  }
}
