package io.apocalypse;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpMethod;

import static org.assertj.core.api.Assertions.assertThat;

import tools.jackson.databind.JsonNode;

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "apocalypse.capabilities.calendar.enabled=true")
class CalendarApprovalBindingIT extends AbstractIntegrationTest {

  @Test
  void eventApprovalCannotSurviveDiscardAndRecreationEvenWithIdenticalContent() {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);
    String base = calendar("event-replacement", token) + "/managed-events";
    JsonNode first = postForData(base, Map.of("content", eventContent("Meeting", "Agenda")), token);
    String event = base + "/" + first.get("id").asText();
    postForData(event + "/publish", eventPublish(first), token);
    JsonNode reviewed = eventDraft(event, "Meeting", "Agenda", token);
    deleteForData(event + "/draft", token);
    JsonNode replacement = eventDraft(event, "Meeting", "Agenda", token);

    assertThat(replacement.get("contentHash")).isEqualTo(reviewed.get("contentHash"));
    assertThat(replacement.get("revisionNo").asInt())
        .isGreaterThan(reviewed.get("revisionNo").asInt());
    assertThat(replacement.get("revisionVersion").asInt())
        .isGreaterThan(reviewed.get("revisionVersion").asInt());
    assertThat(
            exchangeRaw(event + "/publish", HttpMethod.POST, eventPublish(reviewed), token)
                .get("code")
                .asInt())
        .isEqualTo(40900);
    assertThat(
            postForData(event + "/publish", eventPublish(replacement), token)
                .get("revisionState")
                .asText())
        .isEqualTo("PUBLISHED");
  }

  @Test
  void eventDelimiterCollisionDoesNotReusePublisherConfirmation() {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);
    String base = calendar("event-delimiter", token) + "/managed-events";
    JsonNode first =
        postForData(base, Map.of("content", eventContent("Initial", "Initial")), token);
    String event = base + "/" + first.get("id").asText();
    postForData(event + "/publish", eventPublish(first), token);
    JsonNode reviewed = eventDraft(event, "Meeting", "Agenda|Room 101", token);
    deleteForData(event + "/draft", token);
    JsonNode replacement = eventDraft(event, "Meeting|Agenda", "Room 101", token);

    assertThat(replacement.get("contentHash")).isNotEqualTo(reviewed.get("contentHash"));
    assertThat(
            exchangeRaw(event + "/publish", HttpMethod.POST, eventPublish(reviewed), token)
                .get("code")
                .asInt())
        .isEqualTo(40900);
    postForData(event + "/publish", eventPublish(replacement), token);
  }

  @Test
  void overrideApprovalCannotSurviveDiscardAndRecreationEvenWithIdenticalContent() {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);
    String base = calendar("override-replacement", token) + "/managed-overrides";
    JsonNode reviewed = putForData(base + "/draft/days/2026-09-22", override(), token);
    deleteForData(base + "/draft", token);
    JsonNode replacement = putForData(base + "/draft/days/2026-09-22", override(), token);

    assertThat(replacement.get("contentHash")).isEqualTo(reviewed.get("contentHash"));
    assertThat(replacement.get("version").asInt()).isGreaterThan(reviewed.get("version").asInt());
    assertThat(
            exchangeRaw(base + "/draft/publish", HttpMethod.POST, overridePublish(reviewed), token)
                .get("code")
                .asInt())
        .isEqualTo(40900);
    assertThat(
            postForData(base + "/draft/publish", overridePublish(replacement), token)
                .get("state")
                .asText())
        .isEqualTo("PUBLISHED");
  }

  @Test
  void existingLegacyEventHashRequiresSavingAndReviewBeforePublication() {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);
    String base = calendar("event-legacy", token) + "/managed-events";
    JsonNode draft = postForData(base, Map.of("content", eventContent("Meeting", "Agenda")), token);
    String legacyHash = "b1d0c65e2b17219d85afd379018059b518b461980d02a2f57980959cdb6946d2";
    jdbcTemplate.update(
        "UPDATE cal_event_revision SET content_hash = ? WHERE event_id = ? AND state = 'DRAFT'",
        legacyHash,
        Long.valueOf(draft.get("id").asText()));
    JsonNode read = getForData(base + "/page", token).at("/list/0");
    assertThat(read.get("contentHash").asText()).isEqualTo(legacyHash);
    String event = base + "/" + draft.get("id").asText();
    assertThat(
            exchangeRaw(event + "/publish", HttpMethod.POST, eventPublish(read), token)
                .get("code")
                .asInt())
        .isEqualTo(40900);
    JsonNode saved = eventDraft(event, "Meeting", "Agenda", token);
    assertThat(saved.get("contentHash").asText()).isNotEqualTo(legacyHash);
    postForData(event + "/publish", eventPublish(saved), token);
  }

  @Test
  void existingLegacyOverrideHashRequiresSavingAndReviewBeforePublication() {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);
    String base = calendar("override-legacy", token) + "/managed-overrides";
    JsonNode draft = putForData(base + "/draft/days/2026-09-22", override(), token);
    String legacyHash = "40230f5e3b9490306ff69f7aa483d39b038186fa5d0d38c1939e27bb73ae41af";
    jdbcTemplate.update(
        "UPDATE cal_override_revision SET content_hash = ? WHERE id = ?",
        legacyHash,
        Long.valueOf(draft.get("id").asText()));
    JsonNode read = getForData(base + "/draft", token);
    assertThat(read.get("contentHash").asText()).isEqualTo(legacyHash);
    assertThat(
            exchangeRaw(base + "/draft/publish", HttpMethod.POST, overridePublish(read), token)
                .get("code")
                .asInt())
        .isEqualTo(40900);
    JsonNode saved =
        putForData(
            base + "/draft/days/2026-09-22", override(read.get("revisionNo").asInt()), token);
    assertThat(saved.get("contentHash").asText()).isNotEqualTo(legacyHash);
    postForData(base + "/draft/publish", overridePublish(saved), token);
  }

  private String calendar(String key, String token) {
    return "/calendar/calendars/"
        + postForData(
                "/calendar/calendars",
                Map.of(
                    "calendarKey", "it-approval-" + key,
                    "name", key,
                    "parentId", "1",
                    "regionCode", "CN",
                    "zoneId", "Asia/Shanghai"),
                token)
            .get("id")
            .asText();
  }

  private JsonNode eventDraft(String event, String title, String description, String token) {
    return putForData(
        event + "/draft",
        Map.of("expectedDraftVersion", 0, "content", eventContent(title, description)),
        token);
  }

  private static Map<String, Object> eventContent(String title, String description) {
    return Map.of(
        "title", title,
        "description", description,
        "location", "HQ",
        "timeKind", "ALL_DAY",
        "startDate", "2026-10-01",
        "endDateExclusive", "2026-10-02");
  }

  private static Map<String, Object> eventPublish(JsonNode draft) {
    return Map.of(
        "expectedDraftVersion", draft.get("revisionVersion").asInt(),
        "expectedContentHash", draft.get("contentHash").asText());
  }

  private static Map<String, Object> override() {
    return override(0);
  }

  private static Map<String, Object> override(int expectedRevisionNo) {
    return Map.of(
        "expectedRevisionNo",
        expectedRevisionNo,
        "operations",
        List.of(
            Map.of(
                "field",
                "DISPLAY_NOTE",
                "action",
                "SET",
                "value",
                Map.of("text", "Reviewed | note\n会议"))));
  }

  private static Map<String, Object> overridePublish(JsonNode draft) {
    return Map.of(
        "expectedDraftVersion", draft.get("version").asInt(),
        "expectedContentHash", draft.get("contentHash").asText(),
        "conflictResolutions", List.of());
  }
}
