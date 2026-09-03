package io.apocalypse;

import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpMethod;

import static org.assertj.core.api.Assertions.assertThat;

import tools.jackson.databind.JsonNode;

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "apocalypse.capabilities.calendar.enabled=true")
class CalendarRevisionConcurrencyIT extends AbstractIntegrationTest {

  @Test
  void personalOverridesRemainOwnerScopedEvenForAnotherPlatformAdministrator() {
    String admin = loginAndGetToken("admin", ADMIN_PASSWORD);
    JsonNode other =
        postForData(
            "/system/users",
            Map.of(
                "username",
                "override_scope_admin",
                "password",
                ADMIN_PASSWORD,
                "nickname",
                "Other administrator",
                "deptId",
                "11"),
            admin);
    putForData("/system/users/" + other.get("id").asText() + "/roles", List.of("1"), admin);
    admin = loginAndGetToken("admin", ADMIN_PASSWORD);
    String id = calendar("owner-scope", admin);
    String base = "/calendar/calendars/" + id;
    putForData(
        base + "/members/" + other.get("id").asText(),
        Map.of("role", "READER", "expectedVersion", 0),
        admin);
    String otherToken = loginAndGetToken("override_scope_admin", ADMIN_PASSWORD);
    putForData(base + "/personal-overrides/2026-09-02", override(0, "Owner A"), admin);
    assertThat(
            getForData(base + "/personal-overrides?from=2026-09-01&to=2026-09-30", otherToken)
                .isNull())
        .isTrue();
    assertThat(
            getForData("/calendar/days/2026-09-02?calendarId=" + id, otherToken)
                .at("/effective/displayLabel")
                .isNull())
        .isTrue();
    putForData(base + "/personal-overrides/2026-09-02", override(0, "Owner B"), otherToken);
    assertThat(
            getForData("/calendar/days/2026-09-02?calendarId=" + id, admin)
                .at("/effective/displayLabel")
                .asText())
        .isEqualTo("Owner A");
    assertThat(
            getForData("/calendar/days/2026-09-02?calendarId=" + id, otherToken)
                .at("/effective/displayLabel")
                .asText())
        .isEqualTo("Owner B");
  }

  @Test
  void firstPersonalWritersReturnOneSuccessAndOneStableConflict() throws Exception {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);
    String id = calendar("first-personal", token);
    String path = "/calendar/calendars/" + id + "/personal-overrides/2026-09-02";
    var results =
        concurrently(
            () -> exchangeRaw(path, HttpMethod.PUT, override(0, "A"), token),
            () -> exchangeRaw(path, HttpMethod.PUT, override(0, "B"), token));
    assertThat(results.stream().map(value -> value.get("code").asInt()))
        .containsExactlyInAnyOrder(0, 40900);
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT count(*) FROM cal_override_revision WHERE calendar_id = ?",
                Integer.class,
                Long.valueOf(id)))
        .isEqualTo(1);
  }

  @Test
  void simultaneousDraftEditsOfDifferentDatesDoNotLoseEitherChange() throws Exception {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);
    String id = calendar("merge-draft", token);
    String base = "/calendar/calendars/" + id + "/managed-overrides";
    putForData(base + "/draft/days/2026-09-01", override(0, "original"), token);
    var results =
        concurrently(
            () ->
                exchangeRaw(
                    base + "/draft/days/2026-09-02", HttpMethod.PUT, override(1, "A"), token),
            () ->
                exchangeRaw(
                    base + "/draft/days/2026-09-03", HttpMethod.PUT, override(1, "B"), token));
    assertThat(results.stream().map(value -> value.get("code").asInt())).containsOnly(0);
    assertThat(getForData(base + "/draft", token).get("items")).hasSize(3);
  }

  @Test
  void withdrawingAndRecreatingUsesNewRevisionNumbersAndRetainsHistory() {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);
    String id = calendar("history", token);
    String base = "/calendar/calendars/" + id + "/managed-overrides";
    JsonNode first = putForData(base + "/draft/days/2026-09-02", override(0, "original"), token);
    JsonNode published = postForData(base + "/draft/publish", publish(first), token);
    postForData(base + "/revisions/" + published.get("id").asText() + "/withdraw", null, token);
    JsonNode replacement =
        putForData(base + "/draft/days/2026-09-02", override(0, "original"), token);
    assertThat(replacement.get("revisionNo").asInt()).isEqualTo(2);
    postForData(base + "/draft/publish", publish(replacement), token);
    JsonNode history = getForData(base + "/revisions/page", token);
    assertThat(history.get("total").asInt()).isEqualTo(2);
    assertThat(history.at("/list/1/state").asText()).isEqualTo("WITHDRAWN");
    assertThat(history.at("/list/1/contentHash")).isEqualTo(first.get("contentHash"));
    assertThat(
            getForData("/calendar/days/2026-09-02?calendarId=" + id, token)
                .at("/effective/displayLabel")
                .asText())
        .isEqualTo("original");
    assertThat(
            getForData("/calendar/days/2026-09-02?calendarId=" + id, token)
                .at("/baseline/displayLabel")
                .isNull())
        .isTrue();
  }

  @Test
  void concurrentPublicationHasOneEffectAndStableRepeatOutcome() throws Exception {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);
    String id = calendar("publish-repeat", token);
    String base = "/calendar/calendars/" + id + "/managed-overrides";
    JsonNode draft =
        putForData(base + "/draft/days/2026-09-02", override(0, "single publication"), token);
    var results =
        concurrently(
            () -> exchangeRaw(base + "/draft/publish", HttpMethod.POST, publish(draft), token),
            () -> exchangeRaw(base + "/draft/publish", HttpMethod.POST, publish(draft), token));
    // S2 has no publish idempotency key: the consumed draft is rejected on repeat, without a second
    // effect.
    assertThat(results.stream().map(value -> value.get("code").asInt()))
        .containsExactlyInAnyOrder(0, 11006);
    assertThat(getForData(base + "/revisions/page", token).get("total").asInt()).isEqualTo(1);
    assertThat(getForData(base + "/revisions/page", token).at("/list/0/state").asText())
        .isEqualTo("PUBLISHED");
  }

  private String calendar(String key, String token) {
    return postForData(
            "/calendar/calendars",
            Map.of(
                "calendarKey",
                "it-revision-" + key,
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

  private static Map<String, Object> override(int expected, String text) {
    return Map.of(
        "expectedRevisionNo",
        expected,
        "operations",
        List.of(Map.of("field", "DISPLAY_LABEL", "action", "SET", "value", Map.of("text", text))));
  }

  private static Map<String, Object> publish(JsonNode draft) {
    return Map.of(
        "expectedDraftVersion",
        draft.get("version").asInt(),
        "expectedContentHash",
        draft.get("contentHash").asText(),
        "conflictResolutions",
        List.of());
  }

  private static List<JsonNode> concurrently(Callable<JsonNode> first, Callable<JsonNode> second)
      throws Exception {
    CountDownLatch start = new CountDownLatch(1);
    try (var executor = Executors.newFixedThreadPool(2)) {
      var a =
          executor.submit(
              () -> {
                start.await();
                return first.call();
              });
      var b =
          executor.submit(
              () -> {
                start.await();
                return second.call();
              });
      start.countDown();
      return List.of(a.get(15, TimeUnit.SECONDS), b.get(15, TimeUnit.SECONDS));
    }
  }
}
