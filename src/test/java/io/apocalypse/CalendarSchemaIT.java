package io.apocalypse;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

import static org.assertj.core.api.Assertions.assertThat;

import tools.jackson.databind.JsonNode;

/** V8/V9 可执行证据：12 张业务表、系统根、基线、module_key 与默认关闭行为均来自真实迁移链。 */
class CalendarSchemaIT extends AbstractIntegrationTest {

  private static final List<String> CALENDAR_TABLES =
      List.of(
          "cal_baseline_release",
          "cal_baseline_correction",
          "cal_calendar",
          "cal_calendar_member",
          "cal_override_revision",
          "cal_day_override",
          "cal_override_conflict",
          "cal_event",
          "cal_event_revision",
          "cal_projection_grant",
          "cal_projection_source",
          "cal_data_import");

  @Test
  void migrationsCreateExactlyTheApprovedCalendarTablesAndSeeds() {
    List<String> tables =
        jdbcTemplate.queryForList(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name LIKE 'cal_%'
            ORDER BY table_name
            """,
            String.class);

    assertThat(tables).containsExactlyInAnyOrderElementsOf(CALENDAR_TABLES);
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT calendar_key FROM cal_calendar WHERE kind = 'SYSTEM'", String.class))
        .isEqualTo("system-cn");
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT release_key FROM cal_baseline_release WHERE state = 'PUBLISHED'",
                String.class))
        .isEqualTo("CN-2025-2026-R1");
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT holiday_bundle_sha256 FROM cal_baseline_release WHERE state = 'PUBLISHED'",
                String.class))
        .isEqualTo("cd44f16910dd3766450bc869e8263fe747590016443c0cb4fd0fbaa5c72d1963");
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT count(*) FROM sys_menu WHERE module_key = 'calendar'", Integer.class))
        .isEqualTo(27);
    assertThat(
            jdbcTemplate.queryForObject(
                """
                SELECT is_nullable
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'cal_data_import'
                  AND column_name = 'uploader_user_id'
                """,
                String.class))
        .isEqualTo("NO");
    assertThat(
            jdbcTemplate.queryForObject(
                """
                SELECT count(*)
                FROM pg_indexes
                WHERE schemaname = 'public'
                  AND tablename = 'cal_data_import'
                  AND indexname = 'idx_cal_data_import_uploader_created'
                """,
                Integer.class))
        .isEqualTo(1);
  }

  @Test
  void calendarIsAbsentFromRuntimeMenuAndPermissionsByDefault() {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);

    JsonNode me = getForData("/system/users/me", token);

    assertThat(me.get("menus").toString()).doesNotContain("万年历");
    assertThat(me.get("perms").toString()).doesNotContain("calendar:");
  }

  @Test
  void managementTreeKeepsModuleDefinitionForDiagnostics() {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);

    JsonNode tree = getForData("/system/menus/tree", token);

    assertThat(tree.toString()).contains("万年历").contains("\"moduleKey\":\"calendar\"");
  }

  @Test
  void disabledCapabilityDoesNotExposeCalendarHttpRoutes() {
    String token = loginAndGetToken("admin", ADMIN_PASSWORD);

    JsonNode response =
        exchangeRaw("/calendar/days/2026-02-17?calendarId=1", HttpMethod.GET, null, token);

    assertThat(response.get("code").asInt()).isEqualTo(40400);
  }
}
