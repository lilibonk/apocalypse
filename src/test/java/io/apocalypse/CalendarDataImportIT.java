package io.apocalypse;

import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;

import static org.assertj.core.api.Assertions.assertThat;

import tools.jackson.databind.JsonNode;

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "apocalypse.capabilities.calendar.enabled=true")
class CalendarDataImportIT extends AbstractIntegrationTest {

  @Test
  void managedCsvCompletesUploadValidateDiffReviewPublishAndRawDownload() throws Exception {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);
    String suffix = UUID.randomUUID().toString().substring(0, 8);
    JsonNode calendar =
        postForData(
            "/calendar/calendars",
            Map.of(
                "calendarKey",
                "csv-" + suffix,
                "name",
                "CSV 集成测试日历",
                "parentId",
                "1",
                "regionCode",
                "CN",
                "zoneId",
                "Asia/Shanghai"),
            token);
    String calendarId = calendar.get("id").asText();
    byte[] csv =
        ("date,action,classification,name,source_document_no,note\r\n"
                + "2027-09-10,SET,CUSTOM_REST,校庆日,,集成测试\r\n")
            .getBytes(StandardCharsets.UTF_8);

    JsonNode uploaded =
        upload(
            token,
            Map.of(
                "importKey",
                "managed-" + suffix,
                "targetType",
                "MANAGED_OVERRIDE",
                "targetCalendarId",
                calendarId,
                "regionCode",
                "CN",
                "dataYear",
                2027,
                "sourceClaim",
                "LOCAL_POLICY",
                "assuranceLevel",
                "UNVERIFIED"),
            csv);
    assertThat(uploaded.get("state").asText()).isEqualTo("UPLOADED");
    String importId = uploaded.get("id").asText();

    JsonNode validated =
        postForData("/calendar/data-imports/" + importId + "/validate", null, token);
    assertThat(validated.get("state").asText()).isEqualTo("VALIDATED");
    assertThat(validated.at("/validation/valid").asBoolean()).isTrue();
    assertThat(validated.at("/validation/rowCount").asInt()).isEqualTo(1);
    String normalizedHash = validated.get("normalizedPayloadHash").asText();
    String fileHash = validated.at("/dataFile/sha256").asText();

    JsonNode diff = getForData("/calendar/data-imports/" + importId + "/diff", token);
    assertThat(diff.get("added").asInt()).isEqualTo(1);
    assertThat(diff.at("/items/0/newClassification").asText()).isEqualTo("CUSTOM_REST");
    String targetHash = diff.get("targetContentHash").asText();

    JsonNode reviewed =
        postForData(
            "/calendar/data-imports/" + importId + "/review",
            Map.of(
                "expectedVersion",
                validated.get("version").asInt(),
                "expectedDataFileSha256",
                fileHash,
                "expectedNormalizedPayloadHash",
                normalizedHash,
                "sourceAttested",
                true,
                "reviewNote",
                "已核对本地排班政策"),
            token);
    assertThat(reviewed.get("state").asText()).isEqualTo("REVIEWED");

    JsonNode published =
        postForData(
            "/calendar/data-imports/" + importId + "/publish",
            Map.of(
                "expectedVersion",
                reviewed.get("version").asInt(),
                "expectedNormalizedPayloadHash",
                normalizedHash,
                "expectedTargetContentHash",
                targetHash),
            token);
    assertThat(published.get("state").asText()).isEqualTo("PUBLISHED");
    assertThat(published.get("publishedRevisionId").asText()).isNotBlank();

    JsonNode day = getForData("/calendar/days/2027-09-10?calendarId=" + calendarId, token);
    assertThat(day.at("/effective/dayPolicy/classification").asText()).isEqualTo("CUSTOM_REST");
    assertThat(day.at("/effective/dayPolicy/name").asText()).isEqualTo("校庆日");
    assertThat(day.get("resolutions").toString()).contains("MANAGED_OVERRIDE");

    HttpHeaders headers = new HttpHeaders();
    headers.setBearerAuth(token);
    ResponseEntity<byte[]> downloaded =
        restTemplate.exchange(
            "/calendar/data-imports/" + importId + "/files/data",
            HttpMethod.GET,
            new HttpEntity<>(headers),
            byte[].class);
    assertThat(downloaded.getStatusCode().value()).isEqualTo(200);
    assertThat(downloaded.getHeaders().getFirst("X-Content-Type-Options")).isEqualTo("nosniff");
    assertThat(downloaded.getBody()).isEqualTo(csv);
  }

  private JsonNode upload(String token, Map<String, Object> metadata, byte[] csv) throws Exception {
    MultiValueMap<String, Object> parts = new LinkedMultiValueMap<>();
    HttpHeaders metadataHeaders = new HttpHeaders();
    metadataHeaders.setContentType(MediaType.APPLICATION_JSON);
    parts.add(
        "metadata", new HttpEntity<>(objectMapper.writeValueAsString(metadata), metadataHeaders));
    HttpHeaders fileHeaders = new HttpHeaders();
    fileHeaders.setContentType(MediaType.parseMediaType("text/csv;charset=UTF-8"));
    parts.add(
        "dataFile",
        new HttpEntity<>(
            new ByteArrayResource(csv) {
              @Override
              public String getFilename() {
                return "annual.csv";
              }
            },
            fileHeaders));

    HttpHeaders headers = new HttpHeaders();
    headers.setBearerAuth(token);
    headers.setContentType(MediaType.MULTIPART_FORM_DATA);
    ResponseEntity<String> response =
        restTemplate.exchange(
            "/calendar/data-imports",
            HttpMethod.POST,
            new HttpEntity<>(parts, headers),
            String.class);
    assertThat(response.getStatusCode().value()).isEqualTo(200);
    JsonNode envelope = objectMapper.readTree(response.getBody());
    assertThat(envelope.get("code").asInt()).as("上传应成功: %s", envelope).isEqualTo(0);
    return envelope.get("data");
  }
}
