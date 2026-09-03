package io.apocalypse;

import java.time.Duration;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpMethod;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import tools.jackson.databind.JsonNode;

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "apocalypse.capabilities.calendar.enabled=true")
class CalendarAuditIT extends AbstractIntegrationTest {
  @Test
  void actualManagedCommandsRecordActorVersionAndOutcomeWithoutBusinessContent() {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);
    String id = createCalendar("it-audit-events", token);
    String base = "/calendar/calendars/" + id + "/managed-events";
    JsonNode draft = postForData(base, Map.of("content", content()), token);
    String eventId = draft.get("id").asText();
    String path = base + "/" + eventId;
    JsonNode stale =
        exchangeRaw(
            path + "/publish",
            HttpMethod.POST,
            Map.of(
                "expectedDraftVersion",
                99,
                "expectedContentHash",
                draft.get("contentHash").asText()),
            token);
    assertThat(stale.get("code").asInt()).isEqualTo(40900);
    JsonNode published =
        postForData(
            path + "/publish",
            Map.of(
                "expectedDraftVersion",
                draft.get("revisionVersion").asInt(),
                "expectedContentHash",
                draft.get("contentHash").asText()),
            token);
    postForData(path + "/withdraw", null, token);
    JsonNode nextDraft =
        putForData(path + "/draft", Map.of("expectedDraftVersion", 0, "content", content()), token);
    postForData(
        path + "/publish",
        Map.of(
            "expectedDraftVersion",
            nextDraft.get("revisionVersion").asInt(),
            "expectedContentHash",
            nextDraft.get("contentHash").asText()),
        token);
    postForData(path + "/cancel", null, token);

    await()
        .atMost(Duration.ofSeconds(15))
        .untilAsserted(
            () -> {
              List<Map<String, Object>> logs =
                  jdbcTemplate.queryForList(
                      "SELECT * FROM sys_oper_log WHERE title = '托管日程' AND (oper_param LIKE ? OR oper_result LIKE ?)",
                      "%" + eventId + "%",
                      "%" + eventId + "%");
              assertThat(logs).hasSize(7);
              assertThat(logs)
                  .allSatisfy(
                      row -> {
                        assertThat(row.get("oper_name")).isEqualTo("admin");
                        assertThat(row.get("event_id")).isNotNull();
                        assertThat(row.get("oper_time")).isNotNull();
                        assertThat(row.toString())
                            .doesNotContain(
                                "AUDIT_PRIVATE", "Sensitive room", "Sensitive description");
                      });
              assertThat(logs)
                  .anySatisfy(
                      row -> {
                        assertThat(row.get("status")).isEqualTo(0);
                        assertThat(row.get("error_msg")).isEqualTo("BizException:40900");
                      });
              assertThat(logs)
                  .anySatisfy(
                      row -> {
                        assertThat(row.get("business_type")).isEqualTo("PUBLISH");
                        assertThat(row.get("status")).isEqualTo(1);
                        assertThat(
                                objectMapper
                                    .readTree((String) row.get("oper_result"))
                                    .get("/revisionNo")
                                    .asInt())
                            .isEqualTo(published.get("revisionNo").asInt());
                      });
            });
    // Void commands identify the event; immutable revision audit retains the exact affected
    // version.
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT count(*) FROM cal_event_revision WHERE event_id = ? AND update_by = 'admin'",
                Integer.class,
                Long.valueOf(eventId)))
        .isPositive();
  }

  @Test
  void overridePublicationWithdrawalAndPersonalSaveAreAuditedWithoutValues() {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);
    String id = createCalendar("it-audit-overrides", token);
    String base = "/calendar/calendars/" + id + "/managed-overrides";
    Map<String, Object> command =
        Map.of(
            "expectedRevisionNo",
            0,
            "operations",
            List.of(
                Map.of(
                    "field",
                    "DISPLAY_NOTE",
                    "action",
                    "SET",
                    "value",
                    Map.of("text", "AUDIT_PRIVATE_NOTE"))));
    JsonNode draft = putForData(base + "/draft/days/2026-09-02", command, token);
    JsonNode published =
        postForData(
            base + "/draft/publish",
            Map.of(
                "expectedDraftVersion",
                draft.get("version").asInt(),
                "expectedContentHash",
                draft.get("contentHash").asText(),
                "conflictResolutions",
                List.of()),
            token);
    postForData(base + "/revisions/" + published.get("id").asText() + "/withdraw", null, token);
    putForData("/calendar/calendars/" + id + "/personal-overrides/2026-09-02", command, token);
    await()
        .atMost(Duration.ofSeconds(15))
        .untilAsserted(
            () -> {
              var logs =
                  jdbcTemplate.queryForList(
                      "SELECT * FROM sys_oper_log WHERE title IN ('托管覆盖', '个人覆盖') AND oper_param LIKE ?",
                      "%" + id + "%");
              assertThat(logs)
                  .hasSize(4)
                  .allSatisfy(
                      row -> {
                        assertThat(row.get("status")).isEqualTo(1);
                        assertThat(row.get("oper_name")).isEqualTo("admin");
                        assertThat(row.toString()).doesNotContain("AUDIT_PRIVATE_NOTE");
                      });
              assertThat(logs)
                  .anySatisfy(
                      row -> {
                        assertThat(row.get("business_type")).isEqualTo("WITHDRAW");
                        assertThat((String) row.get("oper_param"))
                            .contains(published.get("id").asText());
                      });
            });
  }

  private String createCalendar(String key, String token) {
    return postForData(
            "/calendar/calendars",
            Map.of(
                "calendarKey",
                key,
                "name",
                key,
                "parentId",
                "1",
                "regionCode",
                "CN",
                "zoneId",
                "Asia/Shanghai"),
            token)
        .get("id")
        .asText();
  }

  private static Map<String, Object> content() {
    return Map.of(
        "title",
        "AUDIT_PRIVATE_TITLE",
        "description",
        "Sensitive description",
        "location",
        "Sensitive room",
        "timeKind",
        "ALL_DAY",
        "startDate",
        "2026-09-02",
        "endDateExclusive",
        "2026-09-03");
  }
}
