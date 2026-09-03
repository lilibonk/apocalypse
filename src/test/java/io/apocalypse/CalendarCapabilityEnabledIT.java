package io.apocalypse;

import io.apocalypse.calendar.api.CalendarProjectionApi;
import io.apocalypse.calendar.api.CancelProjectedEventCommand;
import io.apocalypse.calendar.api.CancelProjectionBatchCommand;
import io.apocalypse.calendar.api.ProjectedEventCommand;
import io.apocalypse.calendar.api.ProjectedEventContent;
import io.apocalypse.calendar.api.ProjectionBatchCommand;
import io.apocalypse.calendar.api.ProjectionResultStatus;
import io.apocalypse.calendar.api.ProjectionTimeKind;
import io.apocalypse.common.exception.BizException;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpMethod;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import tools.jackson.databind.JsonNode;

/** 显式启用证据：同一 Schema 与角色关系在新会话中恢复 Calendar 菜单及 26 个权限。 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "apocalypse.capabilities.calendar.enabled=true")
class CalendarCapabilityEnabledIT extends AbstractIntegrationTest {

  @Autowired private CalendarProjectionApi calendarProjectionApi;

  @Test
  void enabledCapabilityRestoresCalendarMenuAndPermissions() {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);

    JsonNode me = getForData("/system/users/me", token);
    assertThat(me.get("menus").toString()).contains("万年历");
    JsonNode overviewMenu = findMenu(me.get("menus"), "日历视图");
    assertThat(overviewMenu.get("path").asText()).isEqualTo("/calendar");
    assertThat(overviewMenu.get("component").asText()).isEqualTo("calendar/index");
    assertThat(me.get("perms").toString())
        .contains("calendar:day:list")
        .contains("calendar:personal-override:edit")
        .contains("calendar:data-import:publish");
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT count(DISTINCT perms) FROM sys_menu WHERE module_key = 'calendar' AND perms IS NOT NULL",
                Long.class))
        .isEqualTo(26L);
  }

  @Test
  void enabledDateApiReturnsBaselineEffectiveValueAndFieldProvenance() {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);

    JsonNode day = getForData("/calendar/days/2026-02-17?calendarId=1", token);

    assertThat(day.get("date").asText()).isEqualTo("2026-02-17");
    assertThat(day.get("calendarId").asText()).isEqualTo("1");
    assertThat(day.get("calendarKey").asText()).isEqualTo("system-cn");
    assertThat(day.at("/baselineRef/releaseKey").asText()).isEqualTo("CN-2025-2026-R1");
    assertThat(day.at("/baseline/lunarDate/month").asInt()).isEqualTo(1);
    assertThat(day.at("/baseline/lunarDate/day").asInt()).isEqualTo(1);
    assertThat(day.at("/baseline/dayPolicy/classification").asText()).isEqualTo("OFFICIAL_REST");
    assertThat(day.at("/baseline/dayPolicy/name").asText()).isEqualTo("春节");
    assertThat(day.get("effective")).isEqualTo(day.get("baseline"));
    assertThat(day.get("resolutions")).hasSize(6);
    assertThat(day.get("resolutions").toString())
        .contains("SYSTEM_DATASET")
        .contains("CN-2025-2026-R1");
  }

  @Test
  void dateApiDoesNotGuessHolidayPolicyOutsidePublishedYears() {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);

    JsonNode day = getForData("/calendar/days/2027-01-01?calendarId=1", token);

    assertThat(day.at("/baseline/dayPolicy").isNull()).isTrue();
    assertThat(day.get("resolutions").toString())
        .contains("\"field\":\"DAY_POLICY\",\"state\":\"UNPUBLISHED\"");
  }

  @Test
  void dateRangeAndZoneLimitsUseStableCalendarErrors() {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);

    JsonNode oversized =
        exchangeRaw(
            "/calendar/days?calendarId=1&from=2025-01-01&to=2026-01-02",
            org.springframework.http.HttpMethod.GET,
            null,
            token);
    JsonNode invalidZone =
        exchangeRaw(
            "/calendar/days/2026-02-17?calendarId=1&zoneId=Moon/Base",
            org.springframework.http.HttpMethod.GET,
            null,
            token);

    assertThat(oversized.get("code").asInt()).isEqualTo(11011);
    assertThat(invalidZone.get("code").asInt()).isEqualTo(11003);
  }

  @Test
  void personalOverrideSetClearAndInheritAreVersionedAndReversible() {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);
    String date = "2026-09-10";

    JsonNode set =
        putForData(
            "/calendar/calendars/1/personal-overrides/" + date,
            overrideRequest(0, "SET", "我的业务日"),
            token);
    assertThat(set.get("revisionNo").asInt()).isEqualTo(1);
    assertThat(set.get("scope").asText()).isEqualTo("PERSONAL");
    assertThat(set.get("items")).hasSize(1);

    JsonNode effective = getForData("/calendar/days/" + date + "?calendarId=1", token);
    JsonNode withoutPersonal =
        getForData("/calendar/days/" + date + "?calendarId=1&includePersonal=false", token);
    assertThat(effective.at("/effective/displayLabel").asText()).isEqualTo("我的业务日");
    assertThat(effective.get("resolutions").toString()).contains("PERSONAL_OVERRIDE");
    assertThat(withoutPersonal.at("/effective/displayLabel").isNull()).isTrue();

    JsonNode clear =
        putForData(
            "/calendar/calendars/1/personal-overrides/" + date,
            overrideRequest(1, "CLEAR", null),
            token);
    assertThat(clear.get("revisionNo").asInt()).isEqualTo(2);
    JsonNode cleared = getForData("/calendar/days/" + date + "?calendarId=1", token);
    assertThat(cleared.at("/effective/displayLabel").isNull()).isTrue();
    assertThat(cleared.get("resolutions").toString())
        .contains("\"field\":\"DISPLAY_LABEL\",\"state\":\"CLEARED\"")
        .contains("\"action\":\"CLEAR\"");

    JsonNode inherit =
        putForData(
            "/calendar/calendars/1/personal-overrides/" + date,
            overrideRequest(2, "INHERIT", null),
            token);
    assertThat(inherit.get("revisionNo").asInt()).isEqualTo(3);
    JsonNode inherited = getForData("/calendar/days/" + date + "?calendarId=1", token);
    assertThat(inherited.get("effective")).isEqualTo(inherited.get("baseline"));

    JsonNode stale =
        exchangeRaw(
            "/calendar/calendars/1/personal-overrides/" + date,
            HttpMethod.PUT,
            overrideRequest(1, "SET", "过期写入"),
            token);
    assertThat(stale.get("code").asInt()).isEqualTo(40900);
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT count(*) FROM cal_override_revision WHERE scope_type = 'PERSONAL' AND calendar_id = 1 AND owner_user_id = 1",
                Long.class))
        .isEqualTo(3L);
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT count(*) FROM cal_override_revision WHERE scope_type = 'PERSONAL' AND calendar_id = 1 AND owner_user_id = 1 AND state = 'PUBLISHED'",
                Long.class))
        .isEqualTo(1L);
  }

  @Test
  void managedCalendarHierarchyAndLastPublisherAreEnforced() {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);
    JsonNode me = getForData("/system/users/me", token);
    String userId = me.at("/user/id").asText();

    JsonNode school =
        postForData(
            "/calendar/calendars",
            Map.of(
                "calendarKey",
                "it-school",
                "name",
                "集成测试学校",
                "parentId",
                "1",
                "regionCode",
                "CN",
                "zoneId",
                "Asia/Shanghai"),
            token);
    JsonNode clazz =
        postForData(
            "/calendar/calendars",
            Map.of(
                "calendarKey",
                "it-class",
                "name",
                "集成测试班级",
                "parentId",
                school.get("id").asText(),
                "regionCode",
                "CN",
                "zoneId",
                "Asia/Shanghai"),
            token);

    assertThat(school.get("currentUserRole").asText()).isEqualTo("PUBLISHER");
    assertThat(clazz.get("parentId").asText()).isEqualTo(school.get("id").asText());
    JsonNode calendars = getForData("/calendar/calendars", token);
    assertThat(calendars.toString()).contains("it-school").contains("it-class");

    JsonNode members =
        getForData("/calendar/calendars/" + school.get("id").asText() + "/members/page", token);
    assertThat(members.get("total").asLong()).isEqualTo(1L);
    assertThat(members.at("/list/0/role").asText()).isEqualTo("PUBLISHER");

    JsonNode removeLastPublisher =
        exchangeRaw(
            "/calendar/calendars/" + school.get("id").asText() + "/members/" + userId,
            HttpMethod.DELETE,
            null,
            token);
    assertThat(removeLastPublisher.get("code").asInt()).isEqualTo(11013);

    JsonNode cycle =
        exchangeRaw(
            "/calendar/calendars/" + school.get("id").asText(),
            HttpMethod.PUT,
            Map.of(
                "name",
                "集成测试学校",
                "parentId",
                clazz.get("id").asText(),
                "zoneId",
                "Asia/Shanghai",
                "state",
                "ACTIVE",
                "expectedVersion",
                0),
            token);
    assertThat(cycle.get("code").asInt()).isEqualTo(11001);

    JsonNode inheritedDay =
        getForData("/calendar/days/2026-02-17?calendarId=" + clazz.get("id").asText(), token);
    assertThat(inheritedDay.at("/effective/dayPolicy/name").asText()).isEqualTo("春节");
  }

  @Test
  void managedOverrideDraftPublishAndWithdrawControlEffectiveDate() {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);
    String date = "2026-10-08";
    JsonNode calendar =
        postForData(
            "/calendar/calendars",
            Map.of(
                "calendarKey",
                "it-managed-override",
                "name",
                "托管覆盖验收日历",
                "parentId",
                "1",
                "regionCode",
                "CN",
                "zoneId",
                "Asia/Shanghai"),
            token);
    String calendarId = calendar.get("id").asText();
    String basePath = "/calendar/calendars/" + calendarId + "/managed-overrides";

    JsonNode draft =
        putForData(basePath + "/draft/days/" + date, overrideRequest(0, "SET", "校庆排课日"), token);
    assertThat(draft.get("state").asText()).isEqualTo("DRAFT");
    assertThat(draft.get("revisionNo").asInt()).isEqualTo(1);
    assertThat(draft.get("items")).hasSize(1);

    JsonNode beforePublish =
        getForData("/calendar/days/" + date + "?calendarId=" + calendarId, token);
    assertThat(beforePublish.at("/effective/displayLabel").isNull()).isTrue();

    JsonNode stalePublish =
        exchangeRaw(
            basePath + "/draft/publish",
            HttpMethod.POST,
            Map.of(
                "expectedDraftVersion",
                draft.get("version").asInt() + 1,
                "expectedContentHash",
                draft.get("contentHash").asText(),
                "conflictResolutions",
                List.of()),
            token);
    assertThat(stalePublish.get("code").asInt()).isEqualTo(40900);

    JsonNode published =
        postForData(
            basePath + "/draft/publish",
            Map.of(
                "expectedDraftVersion",
                draft.get("version").asInt(),
                "expectedContentHash",
                draft.get("contentHash").asText(),
                "conflictResolutions",
                List.of()),
            token);
    assertThat(published.get("state").asText()).isEqualTo("PUBLISHED");

    JsonNode effective = getForData("/calendar/days/" + date + "?calendarId=" + calendarId, token);
    assertThat(effective.at("/effective/displayLabel").asText()).isEqualTo("校庆排课日");
    assertThat(effective.get("resolutions").toString())
        .contains("MANAGED_OVERRIDE")
        .contains("it-managed-override");

    JsonNode history = getForData(basePath + "/revisions/page", token);
    assertThat(history.get("total").asLong()).isEqualTo(1L);
    assertThat(history.at("/list/0/state").asText()).isEqualTo("PUBLISHED");

    postForData(basePath + "/revisions/" + published.get("id").asText() + "/withdraw", null, token);
    JsonNode afterWithdraw =
        getForData("/calendar/days/" + date + "?calendarId=" + calendarId, token);
    assertThat(afterWithdraw.at("/effective/displayLabel").isNull()).isTrue();
    assertThat(afterWithdraw.get("effective")).isEqualTo(afterWithdraw.get("baseline"));
  }

  @Test
  void managedOverrideConflictBlocksPublishUntilExplicitRebase() {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);
    String date = "2026-10-19";
    JsonNode parent =
        postForData(
            "/calendar/calendars",
            Map.of(
                "calendarKey",
                "it-conflict-parent",
                "name",
                "冲突验收上级日历",
                "parentId",
                "1",
                "regionCode",
                "CN",
                "zoneId",
                "Asia/Shanghai"),
            token);
    JsonNode child =
        postForData(
            "/calendar/calendars",
            Map.of(
                "calendarKey",
                "it-conflict-child",
                "name",
                "冲突验收下级日历",
                "parentId",
                parent.get("id").asText(),
                "regionCode",
                "CN",
                "zoneId",
                "Asia/Shanghai"),
            token);
    String parentOverrides =
        "/calendar/calendars/" + parent.get("id").asText() + "/managed-overrides";
    String childId = child.get("id").asText();
    String childOverrides = "/calendar/calendars/" + childId + "/managed-overrides";

    JsonNode parentDraft =
        putForData(
            parentOverrides + "/draft/days/" + date, overrideRequest(0, "SET", "上级版本 A"), token);
    publishManagedOverride(parentOverrides, parentDraft, List.of(), token);

    JsonNode childDraft =
        putForData(
            childOverrides + "/draft/days/" + date, overrideRequest(0, "SET", "下级自定义 B"), token);
    publishManagedOverride(childOverrides, childDraft, List.of(), token);

    JsonNode nextChildDraft =
        putForData(
            childOverrides + "/draft/days/" + date, overrideRequest(1, "SET", "下级自定义 B"), token);
    JsonNode nextParentDraft =
        putForData(
            parentOverrides + "/draft/days/" + date, overrideRequest(1, "SET", "上级版本 C"), token);
    publishManagedOverride(parentOverrides, nextParentDraft, List.of(), token);

    JsonNode effectiveBeforeReview =
        getForData("/calendar/days/" + date + "?calendarId=" + childId, token);
    assertThat(effectiveBeforeReview.at("/effective/displayLabel").asText()).isEqualTo("下级自定义 B");
    assertThat(effectiveBeforeReview.get("resolutions").toString())
        .contains("\"field\":\"DISPLAY_LABEL\"")
        .contains("\"conflictState\":\"NEEDS_REVIEW\"");

    JsonNode conflicts =
        getForData("/calendar/calendars/" + childId + "/managed-override-conflicts/page", token);
    assertThat(conflicts.get("total").asLong()).isEqualTo(1L);
    assertThat(conflicts.at("/list/0/state").asText()).isEqualTo("OPEN");
    assertThat(conflicts.at("/list/0/previousUnderlay/text").asText()).isEqualTo("上级版本 A");
    assertThat(conflicts.at("/list/0/currentUnderlay/text").asText()).isEqualTo("上级版本 C");
    String conflictId = conflicts.at("/list/0/id").asText();

    JsonNode blocked =
        exchangeRaw(
            childOverrides + "/draft/publish",
            HttpMethod.POST,
            managedPublishRequest(nextChildDraft, List.of()),
            token);
    assertThat(blocked.get("code").asInt()).isEqualTo(11008);

    JsonNode published =
        publishManagedOverride(
            childOverrides,
            nextChildDraft,
            List.of(Map.of("conflictId", conflictId, "resolution", "REBASE")),
            token);
    assertThat(published.get("state").asText()).isEqualTo("PUBLISHED");
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT state FROM cal_override_conflict WHERE id = ?",
                String.class,
                Long.valueOf(conflictId)))
        .isEqualTo("REBASED");

    JsonNode effectiveAfterRebase =
        getForData("/calendar/days/" + date + "?calendarId=" + childId, token);
    assertThat(effectiveAfterRebase.at("/effective/displayLabel").asText()).isEqualTo("下级自定义 B");
    assertThat(effectiveAfterRebase.get("resolutions").toString())
        .contains("\"field\":\"DISPLAY_LABEL\"")
        .doesNotContain("NEEDS_REVIEW");
    JsonNode noRepeatedConflict =
        getForData("/calendar/calendars/" + childId + "/managed-override-conflicts/page", token);
    assertThat(noRepeatedConflict.get("total").asLong()).isZero();
  }

  @Test
  void personalOverrideConflictCanExplicitlyInheritChangedManagedValue() {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);
    String date = "2026-10-20";
    JsonNode calendar =
        postForData(
            "/calendar/calendars",
            Map.of(
                "calendarKey",
                "it-personal-conflict",
                "name",
                "个人冲突验收日历",
                "parentId",
                "1",
                "regionCode",
                "CN",
                "zoneId",
                "Asia/Shanghai"),
            token);
    String calendarId = calendar.get("id").asText();
    String managedOverrides = "/calendar/calendars/" + calendarId + "/managed-overrides";

    JsonNode managedDraft =
        putForData(
            managedOverrides + "/draft/days/" + date, overrideRequest(0, "SET", "组织版本 A"), token);
    publishManagedOverride(managedOverrides, managedDraft, List.of(), token);
    putForData(
        "/calendar/calendars/" + calendarId + "/personal-overrides/" + date,
        overrideRequest(0, "SET", "用户版本 B"),
        token);

    JsonNode nextManagedDraft =
        putForData(
            managedOverrides + "/draft/days/" + date, overrideRequest(1, "SET", "组织版本 C"), token);
    publishManagedOverride(managedOverrides, nextManagedDraft, List.of(), token);

    JsonNode beforeResolution =
        getForData("/calendar/days/" + date + "?calendarId=" + calendarId, token);
    assertThat(beforeResolution.at("/effective/displayLabel").asText()).isEqualTo("用户版本 B");
    assertThat(beforeResolution.get("resolutions").toString()).contains("NEEDS_REVIEW");

    JsonNode conflicts =
        getForData(
            "/calendar/calendars/" + calendarId + "/personal-override-conflicts/page", token);
    assertThat(conflicts.get("total").asLong()).isEqualTo(1L);
    String conflictId = conflicts.at("/list/0/id").asText();
    JsonNode resolved =
        postForData(
            "/calendar/calendars/"
                + calendarId
                + "/personal-override-conflicts/"
                + conflictId
                + "/resolve",
            Map.of("resolution", "INHERIT", "expectedRevisionNo", 1),
            token);
    assertThat(resolved.get("state").asText()).isEqualTo("INHERITED");
    assertThat(resolved.get("resolutionRevisionId").isNull()).isFalse();

    JsonNode afterResolution =
        getForData("/calendar/days/" + date + "?calendarId=" + calendarId, token);
    assertThat(afterResolution.at("/effective/displayLabel").asText()).isEqualTo("组织版本 C");
    assertThat(afterResolution.get("resolutions").toString()).doesNotContain("NEEDS_REVIEW");
    JsonNode noCurrentConflicts =
        getForData(
            "/calendar/calendars/" + calendarId + "/personal-override-conflicts/page", token);
    assertThat(noCurrentConflicts.get("total").asLong()).isZero();
  }

  @Test
  void personalKeepDecisionSurvivesOtherOverrideRevisionsAndReopensForANewUnderlay() {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);
    String keptDate = "2026-11-02";
    String rebasedDate = "2026-11-03";
    JsonNode calendar =
        postForData(
            "/calendar/calendars",
            Map.of(
                "calendarKey", "it-personal-keep-lineage",
                "name", "个人 KEEP 修订继承",
                "parentId", "1",
                "regionCode", "CN",
                "zoneId", "Asia/Shanghai"),
            token);
    String calendarId = calendar.get("id").asText();
    String managed = "/calendar/calendars/" + calendarId + "/managed-overrides";
    String personal = "/calendar/calendars/" + calendarId + "/personal-overrides/";

    JsonNode draft =
        putForData(managed + "/draft/days/" + keptDate, overrideRequest(0, "SET", "底层 A1"), token);
    draft =
        putForData(
            managed + "/draft/days/" + rebasedDate, overrideRequest(1, "SET", "底层 B1"), token);
    publishManagedOverride(managed, draft, List.of(), token);
    putForData(personal + keptDate, overrideRequest(0, "SET", "用户 A"), token);
    putForData(personal + rebasedDate, overrideRequest(1, "SET", "用户 B"), token);

    draft =
        putForData(managed + "/draft/days/" + keptDate, overrideRequest(1, "SET", "底层 A2"), token);
    draft =
        putForData(
            managed + "/draft/days/" + rebasedDate, overrideRequest(2, "SET", "底层 B2"), token);
    publishManagedOverride(managed, draft, List.of(), token);
    JsonNode conflicts =
        getForData(
            "/calendar/calendars/" + calendarId + "/personal-override-conflicts/page", token);
    JsonNode keptConflict = findConflict(conflicts, keptDate);
    JsonNode rebasedConflict = findConflict(conflicts, rebasedDate);

    postForData(
        "/calendar/calendars/"
            + calendarId
            + "/personal-override-conflicts/"
            + keptConflict.get("id").asText()
            + "/resolve",
        Map.of("resolution", "KEEP", "expectedRevisionNo", 2),
        token);
    postForData(
        "/calendar/calendars/"
            + calendarId
            + "/personal-override-conflicts/"
            + rebasedConflict.get("id").asText()
            + "/resolve",
        Map.of("resolution", "REBASE", "expectedRevisionNo", 2),
        token);

    JsonNode carried =
        getForData(
            "/calendar/calendars/" + calendarId + "/personal-override-conflicts/page", token);
    assertThat(findConflict(carried, keptDate).get("state").asText()).isEqualTo("KEPT");
    assertThat(findConflict(carried, rebasedDate)).isNull();
    assertThat(
            getForData("/calendar/days/" + keptDate + "?calendarId=" + calendarId, token)
                .get("resolutions")
                .toString())
        .contains("\"conflictState\":\"KEPT\"");

    putForData(personal + "2026-11-04", overrideRequest(3, "SET", "无关编辑"), token);
    putForData(personal + rebasedDate, overrideRequest(4, "INHERIT", null), token);
    JsonNode afterOtherEdits =
        getForData(
            "/calendar/calendars/" + calendarId + "/personal-override-conflicts/page", token);
    assertThat(findConflict(afterOtherEdits, keptDate).get("state").asText()).isEqualTo("KEPT");
    assertThat(
            getForData("/calendar/days/" + keptDate + "?calendarId=" + calendarId, token)
                .at("/effective/displayLabel")
                .asText())
        .isEqualTo("用户 A");
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT state FROM cal_override_conflict WHERE id = ?",
                String.class,
                Long.valueOf(keptConflict.get("id").asText())))
        .isEqualTo("KEPT");

    draft =
        putForData(
            managed + "/draft/days/" + rebasedDate, overrideRequest(2, "SET", "底层 B3"), token);
    publishManagedOverride(managed, draft, List.of(), token);
    JsonNode afterUnrelatedManagedPublish =
        getForData(
            "/calendar/calendars/" + calendarId + "/personal-override-conflicts/page", token);
    assertThat(findConflict(afterUnrelatedManagedPublish, keptDate).get("state").asText())
        .isEqualTo("KEPT");

    draft =
        putForData(managed + "/draft/days/" + keptDate, overrideRequest(3, "SET", "底层 A3"), token);
    publishManagedOverride(managed, draft, List.of(), token);
    JsonNode reopened =
        getForData(
            "/calendar/calendars/" + calendarId + "/personal-override-conflicts/page", token);
    assertThat(findConflict(reopened, keptDate).get("state").asText()).isEqualTo("OPEN");
  }

  @Test
  void privateEventLifecyclePreservesLocalTimeAndRejectsDstAmbiguity() {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);
    JsonNode created =
        postForData(
            "/calendar/events",
            Map.of(
                "calendarId",
                "1",
                "content",
                Map.of(
                    "title",
                    "个人全天事项",
                    "timeKind",
                    "ALL_DAY",
                    "startDate",
                    "2026-11-10",
                    "endDateExclusive",
                    "2026-11-11")),
            token);
    String eventId = created.get("id").asText();
    assertThat(created.get("eventKind").asText()).isEqualTo("PRIVATE");
    assertThat(created.get("revisionNo").asInt()).isEqualTo(1);
    assertThat(created.at("/content/startDate").asText()).isEqualTo("2026-11-10");

    JsonNode page =
        getForData("/calendar/events/page?calendarId=1&from=2026-11-01&to=2026-11-30", token);
    assertThat(page.toString()).contains(eventId).contains("个人全天事项");

    JsonNode updated =
        putForData(
            "/calendar/events/" + eventId,
            Map.of(
                "calendarId",
                "1",
                "expectedVersion",
                0,
                "content",
                Map.of(
                    "title",
                    "个人定时事项",
                    "timeKind",
                    "TIMED",
                    "startLocal",
                    "2026-11-10 09:00:00",
                    "endLocal",
                    "2026-11-10 10:30:00",
                    "zoneId",
                    "Asia/Shanghai")),
            token);
    assertThat(updated.get("revisionNo").asInt()).isEqualTo(2);
    assertThat(updated.at("/content/startLocal").asText()).isEqualTo("2026-11-10 09:00:00");
    assertThat(updated.at("/content/startOffset").asText()).isEqualTo("+08:00");

    JsonNode stale =
        exchangeRaw(
            "/calendar/events/" + eventId,
            HttpMethod.PUT,
            Map.of(
                "calendarId",
                "1",
                "expectedVersion",
                0,
                "content",
                Map.of(
                    "title",
                    "过期修改",
                    "timeKind",
                    "ALL_DAY",
                    "startDate",
                    "2026-11-10",
                    "endDateExclusive",
                    "2026-11-11")),
            token);
    assertThat(stale.get("code").asInt()).isEqualTo(40900);

    JsonNode gap =
        exchangeRaw(
            "/calendar/events",
            HttpMethod.POST,
            Map.of(
                "calendarId",
                "1",
                "content",
                Map.of(
                    "title",
                    "DST 空档",
                    "timeKind",
                    "TIMED",
                    "startLocal",
                    "2026-03-08 02:30:00",
                    "endLocal",
                    "2026-03-08 04:00:00",
                    "zoneId",
                    "America/New_York")),
            token);
    assertThat(gap.get("code").asInt()).isEqualTo(11004);

    JsonNode overlap =
        exchangeRaw(
            "/calendar/events",
            HttpMethod.POST,
            Map.of(
                "calendarId",
                "1",
                "content",
                Map.of(
                    "title",
                    "DST 重叠",
                    "timeKind",
                    "TIMED",
                    "startLocal",
                    "2026-11-01 01:30:00",
                    "endLocal",
                    "2026-11-01 03:00:00",
                    "zoneId",
                    "America/New_York")),
            token);
    assertThat(overlap.get("code").asInt()).isEqualTo(11005);

    deleteForData("/calendar/events/" + eventId, token);
    JsonNode deleted = exchangeRaw("/calendar/events/" + eventId, HttpMethod.GET, null, token);
    assertThat(deleted.get("code").asInt()).isEqualTo(40400);
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT count(*) FROM cal_event_revision WHERE event_id = ?",
                Long.class,
                Long.valueOf(eventId)))
        .isEqualTo(3L);
  }

  @Test
  void privateEventsRemainInvisibleToAnotherUserAndPlatformAdministrator() {
    long roleId = 9300L;
    long ownerId = 9301L;
    long otherUserId = 9302L;
    createCalendarRole(roleId, "calendar_private_it");
    createCalendarUser(ownerId, "calendar_private_owner", "日程所有者", roleId);
    createCalendarUser(otherUserId, "calendar_private_other", "其他日程用户", roleId);

    String ownerToken = loginAndGetToken("calendar_private_owner", ADMIN_PASSWORD);
    JsonNode created =
        postForData(
            "/calendar/events",
            Map.of(
                "calendarId",
                "1",
                "content",
                Map.of(
                    "title",
                    "仅所有者可见的事项",
                    "timeKind",
                    "ALL_DAY",
                    "startDate",
                    "2026-10-20",
                    "endDateExclusive",
                    "2026-10-21")),
            ownerToken);
    String eventId = created.get("id").asText();

    String otherToken = loginAndGetToken("calendar_private_other", ADMIN_PASSWORD);
    assertThat(
            getForData(
                    "/calendar/events/page?calendarId=1&from=2026-10-01&to=2026-10-31", otherToken)
                .toString())
        .doesNotContain(eventId)
        .doesNotContain("仅所有者可见的事项");
    assertPrivateEventCannotBeAccessed(eventId, otherToken);

    String adminToken = loginAndGetToken("admin", ADMIN_PASSWORD);
    assertThat(
            getForData(
                    "/calendar/events/page?calendarId=1&from=2026-10-01&to=2026-10-31", adminToken)
                .toString())
        .doesNotContain(eventId)
        .doesNotContain("仅所有者可见的事项");
    assertPrivateEventCannotBeAccessed(eventId, adminToken);

    assertThat(getForData("/calendar/events/" + eventId, ownerToken).get("id").asText())
        .isEqualTo(eventId);
  }

  @Test
  void managedEventRequiresPublishAndSupportsWithdrawRepublishAndCancel() {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);
    JsonNode calendar =
        postForData(
            "/calendar/calendars",
            Map.of(
                "calendarKey",
                "it-managed-event",
                "name",
                "托管日程验收日历",
                "parentId",
                "1",
                "regionCode",
                "CN",
                "zoneId",
                "Asia/Shanghai"),
            token);
    String calendarId = calendar.get("id").asText();
    String basePath = "/calendar/calendars/" + calendarId + "/managed-events";
    Map<String, Object> content =
        Map.of(
            "title",
            "校级统一考试",
            "timeKind",
            "ALL_DAY",
            "startDate",
            "2026-12-20",
            "endDateExclusive",
            "2026-12-21");

    JsonNode draft = postForData(basePath, Map.of("content", content), token);
    String eventId = draft.get("id").asText();
    assertThat(draft.get("revisionState").asText()).isEqualTo("DRAFT");
    JsonNode hiddenDraft =
        getForData(
            "/calendar/events/page?calendarId=" + calendarId + "&from=2026-12-01&to=2026-12-31",
            token);
    assertThat(hiddenDraft.toString()).doesNotContain(eventId);

    JsonNode published =
        postForData(
            basePath + "/" + eventId + "/publish",
            Map.of(
                "expectedDraftVersion",
                0,
                "expectedContentHash",
                draft.get("contentHash").asText()),
            token);
    assertThat(published.get("revisionState").asText()).isEqualTo("PUBLISHED");
    JsonNode visible =
        getForData(
            "/calendar/events/page?calendarId=" + calendarId + "&from=2026-12-01&to=2026-12-31",
            token);
    assertThat(visible.toString()).contains(eventId).contains("校级统一考试");

    postForData(basePath + "/" + eventId + "/withdraw", null, token);
    JsonNode hiddenAfterWithdraw =
        getForData(
            "/calendar/events/page?calendarId=" + calendarId + "&from=2026-12-01&to=2026-12-31",
            token);
    assertThat(hiddenAfterWithdraw.toString()).doesNotContain(eventId);

    JsonNode secondDraft =
        putForData(
            basePath + "/" + eventId + "/draft",
            Map.of(
                "expectedDraftVersion",
                0,
                "content",
                Map.of(
                    "title",
                    "校级统一考试（调整）",
                    "timeKind",
                    "ALL_DAY",
                    "startDate",
                    "2026-12-21",
                    "endDateExclusive",
                    "2026-12-22")),
            token);
    assertThat(secondDraft.get("revisionNo").asInt()).isEqualTo(2);
    postForData(
        basePath + "/" + eventId + "/publish",
        Map.of(
            "expectedDraftVersion",
            secondDraft.get("revisionVersion").asInt(),
            "expectedContentHash",
            secondDraft.get("contentHash").asText()),
        token);
    postForData(basePath + "/" + eventId + "/cancel", null, token);

    JsonNode management = getForData(basePath + "/page", token);
    assertThat(management.get("total").asLong()).isEqualTo(1L);
    assertThat(management.at("/list/0/state").asText()).isEqualTo("CANCELLED");
    assertThat(management.at("/list/0/revisionState").asText()).isEqualTo("CANCELLED");

    JsonNode disposable = postForData(basePath, Map.of("content", content), token);
    deleteForData(basePath + "/" + disposable.get("id").asText() + "/draft", token);
    JsonNode afterDiscard = getForData(basePath + "/page", token);
    assertThat(afterDiscard.get("total").asLong()).isEqualTo(1L);
  }

  @Test
  void managedCalendarRolesAndPlatformAdministratorDoNotBypassObjectScope() {
    long roleId = 9400L;
    long publisherId = 9401L;
    long editorId = 9402L;
    long readerId = 9403L;
    long outsiderId = 9404L;
    createCalendarRole(roleId, "calendar_scope_it");
    createCalendarUser(publisherId, "calendar_scope_publisher", "范围发布者", roleId);
    createCalendarUser(editorId, "calendar_scope_editor", "范围编辑者", roleId);
    createCalendarUser(readerId, "calendar_scope_reader", "范围读者", roleId);
    createCalendarUser(outsiderId, "calendar_scope_outsider", "范围外用户", roleId);

    String publisherToken = loginAndGetToken("calendar_scope_publisher", ADMIN_PASSWORD);
    JsonNode calendar =
        postForData(
            "/calendar/calendars",
            Map.of(
                "calendarKey",
                "it-role-matrix",
                "name",
                "范围角色验收日历",
                "parentId",
                "1",
                "regionCode",
                "CN",
                "zoneId",
                "Asia/Shanghai"),
            publisherToken);
    String calendarId = calendar.get("id").asText();
    putForData(
        "/calendar/calendars/" + calendarId + "/members/" + editorId,
        Map.of("role", "EDITOR", "expectedVersion", 0),
        publisherToken);
    putForData(
        "/calendar/calendars/" + calendarId + "/members/" + readerId,
        Map.of("role", "READER", "expectedVersion", 0),
        publisherToken);

    String editorToken = loginAndGetToken("calendar_scope_editor", ADMIN_PASSWORD);
    String basePath = "/calendar/calendars/" + calendarId + "/managed-events";
    JsonNode draft =
        postForData(
            basePath,
            Map.of(
                "content",
                Map.of(
                    "title",
                    "角色矩阵草稿",
                    "timeKind",
                    "ALL_DAY",
                    "startDate",
                    "2026-12-10",
                    "endDateExclusive",
                    "2026-12-11")),
            editorToken);
    String eventId = draft.get("id").asText();

    JsonNode editorPublish =
        exchangeRaw(
            basePath + "/" + eventId + "/publish",
            HttpMethod.POST,
            Map.of(
                "expectedDraftVersion",
                draft.get("revisionVersion").asInt(),
                "expectedContentHash",
                draft.get("contentHash").asText()),
            editorToken);
    assertThat(editorPublish.get("code").asInt()).isEqualTo(40300);

    String readerToken = loginAndGetToken("calendar_scope_reader", ADMIN_PASSWORD);
    JsonNode readerChild =
        exchangeRaw(
            "/calendar/calendars",
            HttpMethod.POST,
            Map.of(
                "calendarKey",
                "it-reader-delegation-denied",
                "name",
                "读者不得委派父级",
                "parentId",
                calendarId,
                "regionCode",
                "CN",
                "zoneId",
                "Asia/Shanghai"),
            readerToken);
    assertThat(readerChild.get("code").asInt()).isEqualTo(40300);

    JsonNode editorChild =
        exchangeRaw(
            "/calendar/calendars",
            HttpMethod.POST,
            Map.of(
                "calendarKey",
                "it-editor-delegation-denied",
                "name",
                "编辑者不得委派父级",
                "parentId",
                calendarId,
                "regionCode",
                "CN",
                "zoneId",
                "Asia/Shanghai"),
            editorToken);
    assertThat(editorChild.get("code").asInt()).isEqualTo(40300);

    JsonNode publisherChild =
        postForData(
            "/calendar/calendars",
            Map.of(
                "calendarKey",
                "it-publisher-delegation",
                "name",
                "发布者委派子日历",
                "parentId",
                calendarId,
                "regionCode",
                "CN",
                "zoneId",
                "Asia/Shanghai"),
            publisherToken);
    assertThat(publisherChild.get("parentId").asText()).isEqualTo(calendarId);

    JsonNode publisherRootCalendar =
        postForData(
            "/calendar/calendars",
            Map.of(
                "calendarKey",
                "it-publisher-reparent",
                "name",
                "发布者待重挂日历",
                "parentId",
                "1",
                "regionCode",
                "CN",
                "zoneId",
                "Asia/Shanghai"),
            publisherToken);
    JsonNode publisherReparented =
        putForData(
            "/calendar/calendars/" + publisherRootCalendar.get("id").asText(),
            Map.of(
                "name",
                "发布者已重挂日历",
                "parentId",
                calendarId,
                "zoneId",
                "Asia/Shanghai",
                "state",
                "ACTIVE",
                "expectedVersion",
                publisherRootCalendar.get("version").asInt()),
            publisherToken);
    assertThat(publisherReparented.get("parentId").asText()).isEqualTo(calendarId);

    JsonNode readerRootCalendar =
        postForData(
            "/calendar/calendars",
            Map.of(
                "calendarKey",
                "it-reader-system-root",
                "name",
                "SYSTEM 根下的读者自有日历",
                "parentId",
                "1",
                "regionCode",
                "CN",
                "zoneId",
                "Asia/Shanghai"),
            readerToken);
    assertThat(readerRootCalendar.get("parentId").asText()).isEqualTo("1");

    JsonNode readerReparent =
        exchangeRaw(
            "/calendar/calendars/" + readerRootCalendar.get("id").asText(),
            HttpMethod.PUT,
            Map.of(
                "name",
                "读者试图重挂",
                "parentId",
                calendarId,
                "zoneId",
                "Asia/Shanghai",
                "state",
                "ACTIVE",
                "expectedVersion",
                readerRootCalendar.get("version").asInt()),
            readerToken);
    assertThat(readerReparent.get("code").asInt()).isEqualTo(40300);
    assertThat(
            getForData("/calendar/calendars/" + readerRootCalendar.get("id").asText(), readerToken)
                .get("parentId")
                .asText())
        .isEqualTo("1");

    JsonNode readerEdit =
        exchangeRaw(
            basePath,
            HttpMethod.POST,
            Map.of(
                "content",
                Map.of(
                    "title",
                    "读者不得编辑",
                    "timeKind",
                    "ALL_DAY",
                    "startDate",
                    "2026-12-11",
                    "endDateExclusive",
                    "2026-12-12")),
            readerToken);
    assertThat(readerEdit.get("code").asInt()).isEqualTo(40300);
    JsonNode hiddenDraft =
        getForData(
            "/calendar/events/page?calendarId=" + calendarId + "&from=2026-12-01&to=2026-12-31",
            readerToken);
    assertThat(hiddenDraft.toString()).doesNotContain(eventId).doesNotContain("角色矩阵草稿");

    postForData(
        basePath + "/" + eventId + "/publish",
        Map.of(
            "expectedDraftVersion",
            draft.get("revisionVersion").asInt(),
            "expectedContentHash",
            draft.get("contentHash").asText()),
        publisherToken);
    JsonNode visiblePublished =
        getForData(
            "/calendar/events/page?calendarId=" + calendarId + "&from=2026-12-01&to=2026-12-31",
            readerToken);
    assertThat(visiblePublished.toString()).contains(eventId).contains("角色矩阵草稿");

    String outsiderToken = loginAndGetToken("calendar_scope_outsider", ADMIN_PASSWORD);
    assertThat(
            exchangeRaw("/calendar/calendars/" + calendarId, HttpMethod.GET, null, outsiderToken)
                .get("code")
                .asInt())
        .isEqualTo(40400);
    assertThat(
            exchangeRaw(
                    "/calendar/calendars/" + calendarId,
                    HttpMethod.GET,
                    null,
                    loginAndGetToken("admin", ADMIN_PASSWORD))
                .get("code")
                .asInt())
        .as("平台管理员没有具体日历成员关系时不得穿透范围授权")
        .isEqualTo(40400);
  }

  @Test
  void projectionFacadeEnforcesGrantVersionIdempotencyAndSourceOwnership() {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);
    JsonNode calendar =
        postForData(
            "/calendar/calendars",
            Map.of(
                "calendarKey",
                "it-projection",
                "name",
                "投影验收日历",
                "parentId",
                "1",
                "regionCode",
                "CN",
                "zoneId",
                "Asia/Shanghai"),
            token);
    String calendarId = calendar.get("id").asText();
    putForData(
        "/calendar/calendars/" + calendarId + "/projection-grants/campus-it",
        Map.of("publishMode", "DIRECT_PUBLISH", "expectedVersion", 0),
        token);

    ProjectionBatchCommand versionOne =
        new ProjectionBatchCommand(
            "campus-it",
            "it-projection",
            List.of(projectionEvent("lesson-1", 1, "高等数学", LocalDate.of(2026, 9, 15))));
    var created = calendarProjectionApi.upsert(versionOne).items().getFirst();
    assertThat(created.status()).isEqualTo(ProjectionResultStatus.CREATED);

    var unchanged = calendarProjectionApi.upsert(versionOne).items().getFirst();
    assertThat(unchanged.status()).isEqualTo(ProjectionResultStatus.UNCHANGED);
    var stale =
        calendarProjectionApi
            .upsert(
                new ProjectionBatchCommand(
                    "campus-it",
                    "it-projection",
                    List.of(projectionEvent("lesson-1", 0, "旧版高等数学", LocalDate.of(2026, 9, 15)))))
            .items()
            .getFirst();
    assertThat(stale.status()).isEqualTo(ProjectionResultStatus.STALE);

    assertThatThrownBy(
            () ->
                calendarProjectionApi.upsert(
                    new ProjectionBatchCommand(
                        "campus-it",
                        "it-projection",
                        List.of(
                            projectionEvent("lesson-1", 1, "同版本篡改", LocalDate.of(2026, 9, 15))))))
        .isInstanceOfSatisfying(
            BizException.class, error -> assertThat(error.getCode()).isEqualTo(11010));

    var updated =
        calendarProjectionApi
            .upsert(
                new ProjectionBatchCommand(
                    "campus-it",
                    "it-projection",
                    List.of(projectionEvent("lesson-1", 2, "高等数学（调课）", LocalDate.of(2026, 9, 16)))))
            .items()
            .getFirst();
    assertThat(updated.status()).isEqualTo(ProjectionResultStatus.UPDATED);
    JsonNode visible =
        getForData(
            "/calendar/events/page?calendarId=" + calendarId + "&from=2026-09-01&to=2026-09-30",
            token);
    assertThat(visible.toString()).contains("高等数学（调课）");

    JsonNode sourceOwned =
        exchangeRaw(
            "/calendar/calendars/" + calendarId + "/managed-events/" + updated.eventId() + "/draft",
            HttpMethod.PUT,
            Map.of(
                "expectedDraftVersion",
                0,
                "content",
                Map.of(
                    "title",
                    "HTTP 越权修改",
                    "timeKind",
                    "ALL_DAY",
                    "startDate",
                    "2026-09-16",
                    "endDateExclusive",
                    "2026-09-17")),
            token);
    assertThat(sourceOwned.get("code").asInt()).isEqualTo(11014);

    var cancelled =
        calendarProjectionApi
            .cancel(
                new CancelProjectionBatchCommand(
                    "campus-it",
                    "it-projection",
                    List.of(new CancelProjectedEventCommand("lesson", "lesson-1", 3))))
            .items()
            .getFirst();
    assertThat(cancelled.status()).isEqualTo(ProjectionResultStatus.CANCELLED);
    JsonNode hidden =
        getForData(
            "/calendar/events/page?calendarId=" + calendarId + "&from=2026-09-01&to=2026-09-30",
            token);
    assertThat(hidden.toString()).doesNotContain("高等数学");

    assertThatThrownBy(
            () ->
                calendarProjectionApi.upsert(
                    new ProjectionBatchCommand(
                        "campus-it",
                        "it-projection",
                        List.of(
                            projectionEvent("lesson-1", 4, "禁止复活", LocalDate.of(2026, 9, 17))))))
        .isInstanceOfSatisfying(
            BizException.class, error -> assertThat(error.getCode()).isEqualTo(11006));

    deleteForData("/calendar/calendars/" + calendarId + "/projection-grants/campus-it", token);
    assertThatThrownBy(
            () ->
                calendarProjectionApi.upsert(
                    new ProjectionBatchCommand(
                        "campus-it",
                        "it-projection",
                        List.of(
                            projectionEvent("lesson-2", 1, "未授权课次", LocalDate.of(2026, 9, 18))))))
        .isInstanceOfSatisfying(
            BizException.class, error -> assertThat(error.getCode()).isEqualTo(11009));
  }

  private static Map<String, Object> overrideRequest(
      int expectedRevisionNo, String action, String text) {
    Map<String, Object> operation =
        text == null
            ? Map.of("field", "DISPLAY_LABEL", "action", action)
            : Map.of("field", "DISPLAY_LABEL", "action", action, "value", Map.of("text", text));
    return Map.of("expectedRevisionNo", expectedRevisionNo, "operations", List.of(operation));
  }

  private void assertPrivateEventCannotBeAccessed(String eventId, String token) {
    assertThat(
            exchangeRaw("/calendar/events/" + eventId, HttpMethod.GET, null, token)
                .get("code")
                .asInt())
        .isEqualTo(40400);
    JsonNode update =
        exchangeRaw(
            "/calendar/events/" + eventId,
            HttpMethod.PUT,
            Map.of(
                "calendarId",
                "1",
                "expectedVersion",
                0,
                "content",
                Map.of(
                    "title",
                    "越权修改",
                    "timeKind",
                    "ALL_DAY",
                    "startDate",
                    "2026-10-20",
                    "endDateExclusive",
                    "2026-10-21")),
            token);
    assertThat(update.get("code").asInt()).isEqualTo(40400);
    assertThat(
            exchangeRaw("/calendar/events/" + eventId, HttpMethod.DELETE, null, token)
                .get("code")
                .asInt())
        .isEqualTo(40400);
  }

  private void createCalendarRole(long roleId, String roleKey) {
    jdbcTemplate.update(
        """
        INSERT INTO sys_role (id, role_name, role_key, sort, status, create_by, update_by)
        VALUES (?, 'Calendar 集成测试角色', ?, 95, 1, 'test', 'test')
        """,
        roleId,
        roleKey);
    jdbcTemplate.update(
        """
        INSERT INTO sys_role_menu (role_id, menu_id)
        SELECT ?, id FROM sys_menu WHERE module_key = 'calendar'
        """,
        roleId);
  }

  private void createCalendarUser(long userId, String username, String nickname, long roleId) {
    jdbcTemplate.update(
        """
        INSERT INTO sys_user
            (id, username, password, nickname, status, create_by, update_by)
        SELECT ?, ?, password, ?, 1, 'test', 'test' FROM sys_user WHERE id = 1
        """,
        userId,
        username,
        nickname);
    jdbcTemplate.update(
        "INSERT INTO sys_user_role (user_id, role_id) VALUES (?, ?)", userId, roleId);
  }

  private static JsonNode findMenu(JsonNode menus, String menuName) {
    for (JsonNode menu : menus) {
      if (menuName.equals(menu.get("menuName").asText())) {
        return menu;
      }
      JsonNode children = menu.get("children");
      if (children != null && children.isArray()) {
        JsonNode found = findMenu(children, menuName);
        if (found != null) {
          return found;
        }
      }
    }
    return null;
  }

  private static JsonNode findConflict(JsonNode page, String date) {
    for (JsonNode value : page.get("list")) {
      if (date.equals(value.get("date").asText())) {
        return value;
      }
    }
    return null;
  }

  private JsonNode publishManagedOverride(
      String basePath, JsonNode draft, List<?> conflictResolutions, String token) {
    return postForData(
        basePath + "/draft/publish", managedPublishRequest(draft, conflictResolutions), token);
  }

  private static Map<String, Object> managedPublishRequest(
      JsonNode draft, List<?> conflictResolutions) {
    return Map.of(
        "expectedDraftVersion",
        draft.get("version").asInt(),
        "expectedContentHash",
        draft.get("contentHash").asText(),
        "conflictResolutions",
        conflictResolutions);
  }

  private static ProjectedEventCommand projectionEvent(
      String sourceKey, long sourceVersion, String title, LocalDate date) {
    return new ProjectedEventCommand(
        "lesson",
        sourceKey,
        sourceVersion,
        new ProjectedEventContent(
            title,
            null,
            null,
            ProjectionTimeKind.ALL_DAY,
            date,
            date.plusDays(1),
            null,
            null,
            null));
  }
}
