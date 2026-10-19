package io.apocalypse;

import io.apocalypse.system.log.service.LogInsightService;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.CacheManager;
import org.springframework.http.HttpMethod;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import tools.jackson.databind.JsonNode;

/** 日志周期统计与热力图：服务端全量聚合、半开区间、桶补零、权限拒绝。断言使用基线差值，避免与其他测试的日志互相干扰。 */
class LogInsightIT extends AbstractIntegrationTest {

  private static final DateTimeFormatter FORMAT =
      DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

  @Autowired private CacheManager cacheManager;

  private String token;

  @BeforeEach
  void login() {
    clearInsightCache();
    LocalDateTime started = LocalDateTime.now().minusSeconds(1);
    token = loginAndGetToken("admin", ADMIN_PASSWORD);
    // 登录日志异步落库；等待本次登录写入后再取基线，避免当前小时桶在断言期间变化。
    await()
        .atMost(Duration.ofSeconds(10))
        .until(
            () ->
                jdbcTemplate.queryForObject(
                        "SELECT count(*) FROM sys_login_log WHERE username = 'admin' AND login_time >= ?",
                        Long.class,
                        Timestamp.valueOf(started))
                    > 0);
  }

  @Test
  void loginInsightsAggregateFullRangeWithZeroFilledBuckets() {
    JsonNode before = getForData("/system/logs/login/insights?range=DAY", token);
    LocalDateTime threeHoursAgo = LocalDateTime.now().minusHours(3).truncatedTo(ChronoUnit.HOURS);
    LocalDateTime fiveHoursAgo = LocalDateTime.now().minusHours(5).truncatedTo(ChronoUnit.HOURS);
    String user = "insight_" + UUID.randomUUID().toString().substring(0, 8);
    insertLogin(user, "10.9.0.1", 1, threeHoursAgo.plusMinutes(5));
    insertLogin(user, "10.9.0.1", 1, threeHoursAgo.plusMinutes(10));
    insertLogin(user, "10.9.0.2", 0, threeHoursAgo.plusMinutes(15));
    insertLogin(user + "_b", "10.9.0.3", 1, fiveHoursAgo.plusMinutes(1));

    JsonNode after = getForData("/system/logs/login/insights?range=DAY", token);

    assertThat(after.get("range").asText()).isEqualTo("DAY");
    assertThat(after.get("bucketUnit").asText()).isEqualTo("HOURS");
    assertThat(after.get("zone").asText()).isNotBlank();
    assertThat(after.get("utcOffset").asText()).matches("[+-]\\d{2}:\\d{2}");
    assertThat(after.get("buckets")).hasSize(24);
    LocalDateTime first = parse(after.at("/buckets/0/start").asText());
    for (int index = 1; index < 24; index++) {
      assertThat(parse(after.at("/buckets/" + index + "/start").asText()))
          .isEqualTo(first.plusHours(index));
    }
    assertThat(parse(after.get("from").asText())).isEqualTo(first);
    assertThat(parse(after.get("to").asText())).isAfter(first.plusHours(23));

    // 其他并发登录只会落在当前小时桶；其余桶的差值必须正好等于本测试写入的行。
    assertThat(after.get("total").asLong() - before.get("total").asLong())
        .isGreaterThanOrEqualTo(4);
    assertThat(after.get("distinctUsers").asLong()).isGreaterThanOrEqualTo(2);
    Map<String, JsonNode> beforeBuckets = byStart(before);
    Map<String, JsonNode> afterBuckets = byStart(after);
    String three = FORMAT.format(threeHoursAgo);
    String five = FORMAT.format(fiveHoursAgo);
    assertThat(delta(afterBuckets, beforeBuckets, three, "total")).isEqualTo(3);
    assertThat(delta(afterBuckets, beforeBuckets, three, "failed")).isEqualTo(1);
    assertThat(delta(afterBuckets, beforeBuckets, three, "succeeded")).isEqualTo(2);
    assertThat(delta(afterBuckets, beforeBuckets, five, "total")).isEqualTo(1);
    String current = FORMAT.format(LocalDateTime.now().truncatedTo(ChronoUnit.HOURS));
    for (String start : afterBuckets.keySet()) {
      if (!start.equals(three) && !start.equals(five) && !start.equals(current)) {
        assertThat(delta(afterBuckets, beforeBuckets, start, "total")).as(start).isZero();
      }
    }
    assertThat(after.get("peak").asLong()).isGreaterThanOrEqualTo(3);
    assertThat(after.get("previousCovered").asBoolean()).isTrue();
    assertThat(after.get("previousTotal").isNumber()).isTrue();
  }

  @Test
  void windowIsHalfOpenAtTheStartBoundary() {
    JsonNode before = getForData("/system/logs/login/insights?range=WEEK", token);
    LocalDateTime from = parse(before.get("from").asText());
    String user = "boundary_" + UUID.randomUUID().toString().substring(0, 8);
    insertLogin(user, "10.9.1.1", 1, from.minusSeconds(1));
    insertLogin(user, "10.9.1.1", 1, from);

    clearInsightCache();
    JsonNode after = getForData("/system/logs/login/insights?range=WEEK", token);

    assertThat(parse(after.get("from").asText())).isEqualTo(from);
    assertThat(after.get("buckets")).hasSize(7);
    assertThat(after.get("bucketUnit").asText()).isEqualTo("DAYS");
    assertThat(delta(byStart(after), byStart(before), FORMAT.format(from), "total")).isEqualTo(1);
    assertThat(after.get("total").asLong() - before.get("total").asLong()).isEqualTo(1);
  }

  @Test
  void heatmapReturnsAllCellsWithCoverageAndRejectsDayRange() {
    JsonNode before = getForData("/system/logs/login/heatmap?range=WEEK", token);
    LocalDateTime twoDaysAgo =
        LocalDateTime.now().minusDays(2).truncatedTo(ChronoUnit.HOURS).plusMinutes(7);
    insertLogin("heat_" + UUID.randomUUID().toString().substring(0, 8), "10.9.2.1", 0, twoDaysAgo);

    clearInsightCache();
    JsonNode after = getForData("/system/logs/login/heatmap?range=WEEK", token);

    assertThat(after.get("cells")).hasSize(168);
    JsonNode cellBefore = cell(before, twoDaysAgo);
    JsonNode cellAfter = cell(after, twoDaysAgo);
    assertThat(cellAfter.get("total").asLong() - cellBefore.get("total").asLong()).isEqualTo(1);
    assertThat(cellAfter.get("failed").asLong() - cellBefore.get("failed").asLong()).isEqualTo(1);
    assertThat(cellAfter.get("slots").asInt()).isGreaterThan(0);
    long totalSlots = 0;
    for (JsonNode cell : after.get("cells")) {
      totalSlots += cell.get("slots").asInt();
    }
    // 7 个自然日窗口：前 6 天完整加今天已开始的小时。
    assertThat(totalSlots).isBetween(6L * 24 + 1, 7L * 24);
    assertThat(after.get("maxCell").asLong()).isGreaterThanOrEqualTo(1);

    JsonNode rejected =
        exchangeRaw("/system/logs/login/heatmap?range=DAY", HttpMethod.GET, null, token);
    assertThat(rejected.get("code").asInt()).isEqualTo(40000);
  }

  @Test
  void operationInsightsCountStatusAndBusinessTypes() {
    JsonNode before = getForData("/system/logs/oper/insights?range=MONTH", token);
    LocalDateTime yesterday = LocalDateTime.now().minusDays(1).withHour(10).withMinute(0);
    String type = "INSIGHT_" + UUID.randomUUID().toString().substring(0, 6).toUpperCase();
    insertOper(type, 1, yesterday);
    insertOper(type, 0, yesterday.plusMinutes(1));
    insertOper("  ", 1, yesterday.plusMinutes(2));

    JsonNode after = getForData("/system/logs/oper/insights?range=MONTH", token);

    assertThat(after.get("buckets")).hasSize(30);
    assertThat(after.get("total").asLong() - before.get("total").asLong()).isEqualTo(3);
    assertThat(after.get("failed").asLong() - before.get("failed").asLong()).isEqualTo(1);
    assertThat(after.get("unknown").asLong()).isZero();
    assertThat(after.get("successRate").asDouble()).isBetween(0.0, 100.0);
    Map<String, Long> types = new HashMap<>();
    for (JsonNode row : after.get("byBusinessType")) {
      types.put(
          row.get("type").isNull() ? null : row.get("type").asText(), row.get("count").asLong());
    }
    assertThat(types.get(type)).isEqualTo(2L);
    assertThat(types).containsKey(null);
    assertThat(after.get("previousCovered").asBoolean()).isTrue();
    assertThat(after.get("previousTotal").isNumber()).isTrue();
  }

  @Test
  void insightsRequireTheExistingLogPermissions() {
    long roleId = 970_501L;
    long userId = 970_502L;
    jdbcTemplate.update("DELETE FROM sys_user_role WHERE user_id = ?", userId);
    jdbcTemplate.update("DELETE FROM sys_user WHERE id = ?", userId);
    jdbcTemplate.update("DELETE FROM sys_role_authorization_state WHERE role_id = ?", roleId);
    jdbcTemplate.update("DELETE FROM sys_role WHERE id = ?", roleId);
    jdbcTemplate.update(
        """
        INSERT INTO sys_role (id, role_name, role_key, sort, status, create_by, update_by)
        VALUES (?, '日志统计无权角色', 'insight_denied', 96, 1, 'test', 'test')
        """,
        roleId);
    jdbcTemplate.update(
        "INSERT INTO sys_role_authorization_state(role_id, revision) VALUES (?, 0)", roleId);
    jdbcTemplate.update(
        """
        INSERT INTO sys_user (id, username, password, nickname, status, create_by, update_by)
        SELECT ?, 'insight_denied', password, '无日志权限', 1, 'test', 'test' FROM sys_user WHERE id = 1
        """,
        userId);
    jdbcTemplate.update(
        "INSERT INTO sys_user_role (user_id, role_id) VALUES (?, ?)", userId, roleId);
    String denied = loginAndGetToken("insight_denied", ADMIN_PASSWORD);

    for (String path :
        new String[] {
          "/system/logs/login/insights", "/system/logs/login/heatmap", "/system/logs/oper/insights"
        }) {
      assertThat(exchangeRaw(path, HttpMethod.GET, null, denied).get("code").asInt())
          .as(path)
          .isEqualTo(40300);
    }
  }

  @Test
  void weekAndMonthLoginResultsAreServedFromTheBoundedCacheWhileDayStaysLive() {
    JsonNode week = getForData("/system/logs/login/insights?range=WEEK", token);
    JsonNode heatmap = getForData("/system/logs/login/heatmap?range=MONTH", token);
    JsonNode day = getForData("/system/logs/login/insights?range=DAY", token);
    // 远离当前小时/当天，避免异步落库的登录记录干扰桶差值。
    LocalDateTime twoHoursAgo = LocalDateTime.now().minusHours(2).truncatedTo(ChronoUnit.HOURS);
    LocalDateTime threeDaysAgo = LocalDateTime.now().minusDays(3).truncatedTo(ChronoUnit.DAYS);
    String user = "cache_" + UUID.randomUUID().toString().substring(0, 8);
    insertLogin(user, "10.9.4.1", 1, twoHoursAgo.plusMinutes(5));
    insertLogin(user, "10.9.4.1", 1, threeDaysAgo.plusHours(10));

    // 上限内：同一窗口与总数原样返回，不重新聚合。
    JsonNode cachedWeek = getForData("/system/logs/login/insights?range=WEEK", token);
    assertThat(cachedWeek.get("to").asText()).isEqualTo(week.get("to").asText());
    assertThat(cachedWeek.get("total").asLong()).isEqualTo(week.get("total").asLong());
    JsonNode cachedHeatmap = getForData("/system/logs/login/heatmap?range=MONTH", token);
    assertThat(cachedHeatmap.get("to").asText()).isEqualTo(heatmap.get("to").asText());
    assertThat(cachedHeatmap.get("total").asLong()).isEqualTo(heatmap.get("total").asLong());
    // 24 小时档不缓存，立即反映新记录。
    JsonNode liveDay = getForData("/system/logs/login/insights?range=DAY", token);
    assertThat(delta(byStart(liveDay), byStart(day), FORMAT.format(twoHoursAgo), "total"))
        .isEqualTo(1);

    clearInsightCache();
    JsonNode freshWeek = getForData("/system/logs/login/insights?range=WEEK", token);
    assertThat(delta(byStart(freshWeek), byStart(week), FORMAT.format(threeDaysAgo), "total"))
        .isEqualTo(1);
  }

  private void clearInsightCache() {
    org.springframework.cache.Cache cache = cacheManager.getCache(LogInsightService.INSIGHT_CACHE);
    assertThat(cache).isNotNull();
    cache.clear();
  }

  private void insertLogin(String username, String ip, int success, LocalDateTime time) {
    jdbcTemplate.update(
        """
        INSERT INTO sys_login_log (id, event_id, username, ip, user_agent, success, message, login_time)
        VALUES (?, ?, ?, ?, 'insight-test', ?, 'test', ?)
        """,
        ThreadLocalId.next(),
        UUID.randomUUID(),
        username,
        ip,
        success,
        Timestamp.valueOf(time));
  }

  private void insertOper(String type, int status, LocalDateTime time) {
    jdbcTemplate.update(
        """
        INSERT INTO sys_oper_log (id, event_id, title, business_type, method, oper_name, oper_ip,
            status, oper_time, cost_time)
        VALUES (?, ?, '统计测试', ?, 'test.method', 'admin', '127.0.0.1', ?, ?, 3)
        """,
        ThreadLocalId.next(),
        UUID.randomUUID(),
        type,
        status,
        Timestamp.valueOf(time));
  }

  private static LocalDateTime parse(String value) {
    return LocalDateTime.parse(value, FORMAT);
  }

  private static Map<String, JsonNode> byStart(JsonNode insights) {
    Map<String, JsonNode> buckets = new HashMap<>();
    for (JsonNode bucket : insights.get("buckets")) {
      buckets.put(bucket.get("start").asText(), bucket);
    }
    return buckets;
  }

  private static long delta(
      Map<String, JsonNode> after, Map<String, JsonNode> before, String start, String field) {
    long previous = before.containsKey(start) ? before.get(start).get(field).asLong() : 0;
    return after.get(start).get(field).asLong() - previous;
  }

  private static JsonNode cell(JsonNode heatmap, LocalDateTime time) {
    int weekday = time.getDayOfWeek().getValue();
    for (JsonNode cell : heatmap.get("cells")) {
      if (cell.get("isoWeekday").asInt() == weekday && cell.get("hour").asInt() == time.getHour()) {
        return cell;
      }
    }
    throw new AssertionError("missing heatmap cell");
  }

  /** 测试数据主键：大于种子范围且不与雪花冲突。 */
  private static final class ThreadLocalId {
    private static long sequence = 8_100_000_000_000_000L + System.nanoTime() % 1_000_000_000L;

    static synchronized long next() {
      return ++sequence;
    }
  }
}
