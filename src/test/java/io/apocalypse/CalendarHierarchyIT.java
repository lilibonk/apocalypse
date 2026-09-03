package io.apocalypse;

import java.util.ArrayList;
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
class CalendarHierarchyIT extends AbstractIntegrationTest {
  @Test
  void depthEightWorksAndCreateOrReparentCannotMakeAnyDescendantDepthNine() {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);
    List<JsonNode> chain = new ArrayList<>();
    String parentId = "1";
    for (int depth = 1; depth <= 8; depth++) {
      JsonNode created =
          postForData("/calendar/calendars", createRequest("depth-" + depth, parentId), token);
      chain.add(created);
      parentId = created.get("id").asText();
    }
    assertThat(
            getForData("/calendar/days/2026-09-02?calendarId=" + parentId, token)
                .get("calendarId")
                .asText())
        .isEqualTo(parentId);
    assertThat(
            exchangeRaw(
                    "/calendar/calendars",
                    HttpMethod.POST,
                    createRequest("depth-9-rejected", parentId),
                    token)
                .get("code")
                .asInt())
        .isEqualTo(11002);
    JsonNode sibling =
        postForData("/calendar/calendars", createRequest("depth-sibling", "1"), token);
    JsonNode first = chain.getFirst();
    JsonNode rejected =
        exchangeRaw(
            "/calendar/calendars/" + first.get("id").asText(),
            HttpMethod.PUT,
            Map.of(
                "name",
                "move ancestor",
                "parentId",
                sibling.get("id").asText(),
                "zoneId",
                "Asia/Shanghai",
                "state",
                "ACTIVE",
                "expectedVersion",
                first.get("version").asInt()),
            token);
    assertThat(rejected.get("code").asInt()).isEqualTo(11002);
    assertThat(
            getForData("/calendar/calendars/" + first.get("id").asText(), token)
                .get("parentId")
                .asText())
        .isEqualTo("1");
    assertThat(
            getForData("/calendar/days/2026-09-02?calendarId=" + parentId, token)
                .get("calendarId")
                .asText())
        .isEqualTo(parentId);
  }

  private static Map<String, Object> createRequest(String key, String parentId) {
    return Map.of(
        "calendarKey",
        "it-hierarchy-" + key,
        "name",
        "Depth test " + key,
        "parentId",
        parentId,
        "regionCode",
        "CN",
        "zoneId",
        "Asia/Shanghai");
  }
}
