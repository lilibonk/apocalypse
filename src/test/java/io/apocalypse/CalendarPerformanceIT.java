package io.apocalypse;

import io.apocalypse.calendar.api.CalendarProjectionApi;
import io.apocalypse.calendar.api.ProjectedEventCommand;
import io.apocalypse.calendar.api.ProjectedEventContent;
import io.apocalypse.calendar.api.ProjectionBatchCommand;
import io.apocalypse.calendar.api.ProjectionResultStatus;
import io.apocalypse.calendar.api.ProjectionTimeKind;

import java.time.LocalDate;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Supplier;
import java.util.stream.IntStream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.assertj.core.api.Assertions.assertThat;

import lombok.extern.slf4j.Slf4j;
import tools.jackson.databind.JsonNode;

/** Calendar 大数据量查询基线。仅在显式设置 {@code RUN_CALENDAR_PERF=true} 时运行，避免把数据生成和环境相关的延迟断言加入日常门禁。 */
@Slf4j
@EnabledIfEnvironmentVariable(named = "RUN_CALENDAR_PERF", matches = "true")
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "apocalypse.capabilities.calendar.enabled=true")
class CalendarPerformanceIT extends AbstractIntegrationTest {

  @Autowired private CalendarProjectionApi calendarProjectionApi;

  private static final long TARGET_CALENDAR_ID = 9_100_008L;

  private static final int WARMUP_REQUESTS = 5;

  private static final int MEASURED_REQUESTS = 20;

  /** 2026-09-01 本机基线 p95=65.18ms；保留约 4.6 倍环境波动余量。 */
  private static final double DAY_DETAIL_P95_BUDGET_MS = 300.0;

  /** 2026-09-01 本机基线 p95=86.39ms；保留约 4.6 倍环境波动余量。 */
  private static final double EVENT_PAGE_P95_BUDGET_MS = 400.0;

  /** 2026-09-03 人类临时批准的本机后台同步预算；数据量级上升时重新评估，不代表生产 SLA。 */
  private static final double PROJECTION_BATCH_P95_BUDGET_MS = 5_000.0;

  @Test
  void eightLayersTenThousandOverridesAndFiftyThousandEventsRemainQueryable() {
    seedEightLayerHierarchy();
    seedTenThousandOverrides();
    seedFiftyThousandEvents();
    jdbcTemplate.execute("ANALYZE cal_calendar");
    jdbcTemplate.execute("ANALYZE cal_calendar_member");
    jdbcTemplate.execute("ANALYZE cal_override_revision");
    jdbcTemplate.execute("ANALYZE cal_day_override");
    jdbcTemplate.execute("ANALYZE cal_event");
    jdbcTemplate.execute("ANALYZE cal_event_revision");

    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT count(*) FROM cal_day_override WHERE id BETWEEN 10000001 AND 10010000",
                Long.class))
        .isEqualTo(10_000L);
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT count(*) FROM cal_event WHERE calendar_id = ?",
                Long.class,
                TARGET_CALENDAR_ID))
        .isEqualTo(50_000L);

    String token = loginAndGetToken("admin", ADMIN_PASSWORD);
    String dayPath = "/calendar/days/2026-09-01?calendarId=" + TARGET_CALENDAR_ID;
    String eventPath =
        "/calendar/events/page?calendarId="
            + TARGET_CALENDAR_ID
            + "&from=2026-09-01&to=2026-09-30&page=1&size=200";

    JsonNode day = getForData(dayPath, token);
    assertThat(day.get("calendarId").asText()).isEqualTo(Long.toString(TARGET_CALENDAR_ID));
    assertThat(day.at("/effective/displayNote").isNull()).isTrue();
    assertThat(day.get("resolutions").toString())
        .contains("\"field\":\"DISPLAY_NOTE\"")
        .contains("\"sourceCalendarId\":\"9100008\"")
        .contains("\"layer\":\"MANAGED_OVERRIDE\"");

    JsonNode events = getForData(eventPath, token);
    assertThat(events.get("total").asLong()).isEqualTo(50_000L);
    assertThat(events.get("list")).hasSize(200);
    assertThat(events.at("/list/0/content/title").asText()).startsWith("性能基线事件 ");

    LatencyStats dayLatency = measure(() -> getForData(dayPath, token));
    LatencyStats eventLatency = measure(() -> getForData(eventPath, token));
    String rangePath =
        "/calendar/days?calendarId=" + TARGET_CALENDAR_ID + "&from=2026-01-01&to=2026-12-31";
    assertThat(getForData(rangePath, token)).hasSize(365);
    LatencyStats rangeLatency = measure(() -> getForData(rangePath, token));
    LatencyStats projectionLatency = measureProjectionBatch(token);
    ExplainStats overridePlan = explain(overrideRangeExplainSql());
    ExplainStats eventCountPlan = explain(eventCountExplainSql());

    assertThat(dayLatency.p95Ms()).isLessThan(DAY_DETAIL_P95_BUDGET_MS);
    assertThat(eventLatency.p95Ms()).isLessThan(EVENT_PAGE_P95_BUDGET_MS);
    assertThat(projectionLatency.p95Ms())
        .as("500-event synchronous background batch p95 budget (local baseline only)")
        .isLessThanOrEqualTo(PROJECTION_BATCH_P95_BUDGET_MS);
    assertThat(overridePlan.nodeTypes()).contains("Index Scan");

    log.info(
        "Calendar performance baseline environment: database={}, java={}, processors={}, maxHeapMiB={}",
        jdbcTemplate.queryForObject("SELECT version()", String.class),
        Runtime.version(),
        Runtime.getRuntime().availableProcessors(),
        Runtime.getRuntime().maxMemory() / 1024 / 1024);
    log.info("Calendar day detail baseline: {}", dayLatency);
    log.info("Calendar event page baseline: {}", eventLatency);
    // The yearly range remains measurement-only; the synchronous batch has a provisional local
    // budget approved on 2026-09-03, not a production SLA.
    log.info("Calendar 365-day range baseline (measurement only): {}", rangeLatency);
    log.info(
        "Calendar 500-event projection update baseline (local p95 budget={}ms): {}",
        PROJECTION_BATCH_P95_BUDGET_MS,
        projectionLatency);
    log.info("Calendar override range plan: {}", overridePlan);
    log.info("Calendar event count plan: {}", eventCountPlan);
  }

  private LatencyStats measureProjectionBatch(String token) {
    putForData(
        "/calendar/calendars/" + TARGET_CALENDAR_ID + "/projection-grants/campus-perf",
        Map.of("publishMode", "DIRECT_PUBLISH", "expectedVersion", 0),
        token);
    AtomicLong version = new AtomicLong();
    return measure(
        () -> {
          long sourceVersion = version.incrementAndGet();
          LocalDate date = LocalDate.of(2026, 9, 2);
          var events =
              IntStream.range(0, 500)
                  .mapToObj(
                      index ->
                          new ProjectedEventCommand(
                              "lesson",
                              "perf-lesson-" + index,
                              sourceVersion,
                              new ProjectedEventContent(
                                  "Performance lesson " + index + " v" + sourceVersion,
                                  null,
                                  null,
                                  ProjectionTimeKind.ALL_DAY,
                                  date,
                                  date.plusDays(1),
                                  null,
                                  null,
                                  null)))
                  .toList();
          var result =
              calendarProjectionApi.upsert(
                  new ProjectionBatchCommand("campus-perf", "perf-layer-8", events));
          assertThat(result.items()).hasSize(500);
          assertThat(result.items())
              .allSatisfy(
                  item ->
                      assertThat(item.status())
                          .isEqualTo(
                              sourceVersion == 1
                                  ? ProjectionResultStatus.CREATED
                                  : ProjectionResultStatus.UPDATED));
          return result;
        });
  }

  private void seedEightLayerHierarchy() {
    jdbcTemplate.execute(
        """
        INSERT INTO cal_calendar
          (id, calendar_key, kind, parent_id, name, region_code, zone_id, state,
           create_by, update_by, version, deleted)
        SELECT
          9100000 + layer_no,
          'perf-layer-' || layer_no,
          'MANAGED',
          CASE WHEN layer_no = 1 THEN 1 ELSE 9099999 + layer_no END,
          '性能基线层级 ' || layer_no,
          'CN',
          'Asia/Shanghai',
          'ACTIVE',
          'performance-test',
          'performance-test',
          0,
          0
        FROM generate_series(1, 8) AS layer(layer_no)
        """);
    jdbcTemplate.execute(
        """
        INSERT INTO cal_calendar_member
          (id, calendar_id, user_id, role, state, create_by, update_by, version, deleted)
        SELECT
          9200000 + layer_no,
          9100000 + layer_no,
          1,
          'PUBLISHER',
          'ACTIVE',
          'performance-test',
          'performance-test',
          0,
          0
        FROM generate_series(1, 8) AS layer(layer_no)
        """);
  }

  private void seedTenThousandOverrides() {
    jdbcTemplate.execute(
        """
        INSERT INTO cal_override_revision
          (id, calendar_id, scope_type, owner_user_id, revision_no, state,
           baseline_release_id, content_hash, published_at, published_by,
           create_by, update_by, version, deleted)
        SELECT
          9300000 + layer_no,
          9100000 + layer_no,
          'MANAGED',
          NULL,
          1,
          'PUBLISHED',
          1,
          repeat('a', 64),
          now(),
          'performance-test',
          'performance-test',
          'performance-test',
          0,
          0
        FROM generate_series(1, 8) AS layer(layer_no)
        """);
    jdbcTemplate.execute(
        """
        INSERT INTO cal_day_override
          (id, revision_id, local_date, field_key, action, value_json,
           underlay_value_json, underlay_value_hash, underlay_source_type,
           underlay_source_key, underlay_source_version,
           create_by, update_by, version, deleted)
        SELECT
          10000000 + (layer_no - 1) * 1250 + item_no,
          9300000 + layer_no,
          DATE '2025-01-01' + (item_no - 1),
          'DISPLAY_NOTE',
          'CLEAR',
          NULL,
          jsonb_build_object(
            'field', 'DISPLAY_NOTE',
            'lunarDate', NULL,
            'zodiac', NULL,
            'solarTerm', NULL,
            'dayPolicy', NULL,
            'text', NULL,
            'state', 'CLEARED'),
          '6b274fcf1ecce451f0ea08228888ece6a9275d6be5bc63865a7a70f38913e4ce',
          CASE WHEN layer_no = 1 THEN 'SYSTEM_DATASET' ELSE 'MANAGED_OVERRIDE' END,
          CASE WHEN layer_no = 1 THEN 'system-cn' ELSE 'perf-layer-' || (layer_no - 1) END,
          CASE WHEN layer_no = 1 THEN 'CN-2025-2026-R1' ELSE 'perf-layer-' || (layer_no - 1) || '@1' END,
          'performance-test',
          'performance-test',
          0,
          0
        FROM generate_series(1, 8) AS layer(layer_no)
        CROSS JOIN generate_series(1, 1250) AS item(item_no)
        """);
  }

  private void seedFiftyThousandEvents() {
    jdbcTemplate.execute(
        """
        INSERT INTO cal_event
          (id, calendar_id, event_kind, owner_user_id, source_kind, state,
           create_by, update_by, version, deleted)
        SELECT
          20000000 + event_no,
          9100008,
          'MANAGED',
          NULL,
          'USER',
          'ACTIVE',
          'performance-test',
          'performance-test',
          0,
          0
        FROM generate_series(1, 50000) AS event(event_no)
        """);
    jdbcTemplate.execute(
        """
        INSERT INTO cal_event_revision
          (id, event_id, revision_no, state, title, time_kind,
           start_date, end_date_exclusive, content_hash, published_at, published_by,
           create_by, update_by, version, deleted)
        SELECT
          30000000 + event_no,
          20000000 + event_no,
          1,
          'PUBLISHED',
          '性能基线事件 ' || event_no,
          'ALL_DAY',
          DATE '2026-09-01' + ((event_no - 1) % 30),
          DATE '2026-09-02' + ((event_no - 1) % 30),
          repeat('b', 64),
          now(),
          'performance-test',
          'performance-test',
          'performance-test',
          0,
          0
        FROM generate_series(1, 50000) AS event(event_no)
        """);
  }

  private LatencyStats measure(Supplier<?> request) {
    for (int index = 0; index < WARMUP_REQUESTS; index++) {
      request.get();
    }
    double[] milliseconds = new double[MEASURED_REQUESTS];
    for (int index = 0; index < MEASURED_REQUESTS; index++) {
      long startedAt = System.nanoTime();
      Object data = request.get();
      milliseconds[index] = (System.nanoTime() - startedAt) / 1_000_000.0;
      assertThat(data).isNotNull();
    }
    Arrays.sort(milliseconds);
    return new LatencyStats(
        percentile(milliseconds, 50),
        percentile(milliseconds, 95),
        milliseconds[milliseconds.length - 1],
        MEASURED_REQUESTS);
  }

  private ExplainStats explain(String sql) {
    String value = jdbcTemplate.queryForObject(sql, String.class);
    JsonNode root = objectMapper.readTree(value).get(0);
    Set<String> nodeTypes = new LinkedHashSet<>();
    collectNodeTypes(root.get("Plan"), nodeTypes);
    return new ExplainStats(
        root.get("Planning Time").asDouble(),
        root.get("Execution Time").asDouble(),
        List.copyOf(nodeTypes));
  }

  private static void collectNodeTypes(JsonNode plan, Set<String> nodeTypes) {
    if (plan == null || plan.isNull()) {
      return;
    }
    nodeTypes.add(plan.get("Node Type").asText());
    JsonNode children = plan.get("Plans");
    if (children != null) {
      children.forEach(child -> collectNodeTypes(child, nodeTypes));
    }
  }

  private static double percentile(double[] sortedValues, int percentile) {
    int index = (int) Math.ceil(percentile / 100.0 * sortedValues.length) - 1;
    return sortedValues[Math.max(0, index)];
  }

  private static String overrideRangeExplainSql() {
    return """
        EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
        SELECT id, revision_id, local_date, field_key, action
        FROM cal_day_override
        WHERE revision_id = 9300008 AND deleted = 0
          AND local_date BETWEEN DATE '2026-09-01' AND DATE '2026-09-01'
        ORDER BY local_date, field_key, id
        """;
  }

  private static String eventCountExplainSql() {
    return """
        EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
        SELECT count(*)
        FROM cal_event e
        JOIN cal_event_revision r ON r.event_id = e.id
        WHERE e.deleted = 0 AND e.state = 'ACTIVE'
          AND r.deleted = 0 AND r.state = 'PUBLISHED'
          AND (
            (e.event_kind = 'PRIVATE' AND e.owner_user_id = 1 AND e.calendar_id = 9100008)
            OR
            (e.event_kind = 'MANAGED'
              AND e.calendar_id IN
                (9100001, 9100002, 9100003, 9100004, 9100005, 9100006, 9100007, 9100008))
          )
          AND (
            (r.time_kind = 'ALL_DAY' AND r.start_date < DATE '2026-10-01'
              AND r.end_date_exclusive > DATE '2026-09-01')
            OR
            (r.time_kind = 'TIMED' AND r.start_at_utc < TIMESTAMP '2026-10-01 00:00:00'
              AND r.end_at_utc > TIMESTAMP '2026-09-01 00:00:00')
          )
        """;
  }

  private record LatencyStats(double p50Ms, double p95Ms, double maxMs, int samples) {

    @Override
    public String toString() {
      return String.format(
          Locale.ROOT,
          "p50=%.2fms, p95=%.2fms, max=%.2fms, samples=%d",
          p50Ms,
          p95Ms,
          maxMs,
          samples);
    }
  }

  private record ExplainStats(double planningMs, double executionMs, List<String> nodeTypes) {

    @Override
    public String toString() {
      return String.format(
          Locale.ROOT,
          "planning=%.2fms, execution=%.2fms, nodes=%s",
          planningMs,
          executionMs,
          nodeTypes);
    }
  }
}
