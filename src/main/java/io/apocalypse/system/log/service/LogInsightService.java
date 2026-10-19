package io.apocalypse.system.log.service;

import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.system.log.dto.response.LogBucketResp;
import io.apocalypse.system.log.dto.response.LoginHeatmapCellResp;
import io.apocalypse.system.log.dto.response.LoginHeatmapResp;
import io.apocalypse.system.log.dto.response.LoginInsightResp;
import io.apocalypse.system.log.dto.response.OperInsightResp;
import io.apocalypse.system.log.dto.response.OperTypeCountResp;
import io.apocalypse.system.log.mapper.SysLoginLogMapper;
import io.apocalypse.system.log.mapper.SysOperLogMapper;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

/**
 * 登录/操作日志的服务端周期统计与热力图。
 *
 * <p>日志写入使用 JVM 默认时区的 {@link LocalDateTime}，因此统计在同一时区对齐桶并原样返回本地时间与时区标识； 当前时刻取自统一注入的 {@link
 * Clock}。所有窗口为半开区间，不在 Java 中翻页拼接全量。
 */
@Service
@RequiredArgsConstructor
public class LogInsightService {

  /** 登录统计/热力图结果缓存名；最大年龄由 {@code apocalypse.cache.caches.log-insight} 配置。 */
  public static final String INSIGHT_CACHE = "log-insight";

  private final SysLoginLogMapper sysLoginLogMapper;

  private final SysOperLogMapper sysOperLogMapper;

  private final Clock clock;

  @Value("${apocalypse.audit.retention-days:180}")
  private long retentionDays;

  /** 登录周期统计；近 7/30 天结果经 {@code log-insight} 缓存，最多滞后 60 秒（24 小时档实时计算）。 */
  @Cacheable(
      cacheNames = INSIGHT_CACHE,
      key = "'login:' + #range.name()",
      condition = "#range != T(io.apocalypse.system.log.service.LogInsightRange).DAY",
      sync = true)
  public LoginInsightResp loginInsights(LogInsightRange range) {
    Window window = window(range);
    List<LogBucketResp> buckets =
        fill(
            window,
            sysLoginLogMapper.insightBuckets(sqlUnit(range), window.from(), window.to()),
            SysLoginLogMapper.BucketRow::bucket,
            row -> new LogBucketResp(row.bucket(), row.total(), row.succeeded(), row.failed()));
    SysLoginLogMapper.DistinctRow distinct =
        sysLoginLogMapper.insightDistinct(window.from(), window.to());
    Totals totals = Totals.of(buckets);
    long previous =
        window.previousCovered()
            ? sysLoginLogMapper.countBetween(window.previousFrom(), window.from())
            : 0;
    return new LoginInsightResp(
        range.name(),
        range.unit().name(),
        window.zone().getId(),
        window.utcOffset(),
        window.from(),
        window.to(),
        window.retentionStart(),
        totals.total(),
        totals.succeeded(),
        totals.failed(),
        distinct.users(),
        distinct.ips(),
        totals.peak(),
        totals.average(range.buckets()),
        window.previousCovered(),
        previous,
        buckets);
  }

  /** 星期×小时热力图；仅支持周/月窗口，近 24 小时无法形成星期分布。结果最多滞后 60 秒。 */
  @Cacheable(
      cacheNames = INSIGHT_CACHE,
      key = "'heatmap:' + #range.name()",
      condition = "#range != T(io.apocalypse.system.log.service.LogInsightRange).DAY",
      sync = true)
  public LoginHeatmapResp loginHeatmap(LogInsightRange range) {
    if (range == LogInsightRange.DAY) {
      throw new BizException(ErrorCode.PARAM_INVALID.getCode(), "热力图仅支持近 7 天或近 30 天");
    }
    LogInsightRange effective = range;
    Window window = window(effective);
    LocalDateTime coveredFrom =
        window.from().isBefore(window.retentionStart())
            ? window.retentionStart().truncatedTo(ChronoUnit.HOURS)
            : window.from();
    int[][] slots = new int[7][24];
    for (LocalDateTime hour = coveredFrom.truncatedTo(ChronoUnit.HOURS);
        hour.isBefore(window.to());
        hour = hour.plusHours(1)) {
      slots[hour.getDayOfWeek().getValue() - 1][hour.getHour()]++;
    }
    Map<Integer, SysLoginLogMapper.HeatRow> rows = new HashMap<>();
    for (SysLoginLogMapper.HeatRow row : sysLoginLogMapper.heatmap(coveredFrom, window.to())) {
      rows.put(row.weekday() * 100 + row.hour(), row);
    }
    List<LoginHeatmapCellResp> cells = new ArrayList<>(168);
    long total = 0;
    long failed = 0;
    long max = 0;
    for (int weekday = 1; weekday <= 7; weekday++) {
      for (int hour = 0; hour < 24; hour++) {
        SysLoginLogMapper.HeatRow row = rows.get(weekday * 100 + hour);
        long cellTotal = row == null ? 0 : row.total();
        long cellFailed = row == null ? 0 : row.failed();
        total += cellTotal;
        failed += cellFailed;
        max = Math.max(max, cellTotal);
        cells.add(
            new LoginHeatmapCellResp(
                weekday, hour, cellTotal, cellFailed, slots[weekday - 1][hour]));
      }
    }
    return new LoginHeatmapResp(
        effective.name(),
        window.zone().getId(),
        window.utcOffset(),
        window.from(),
        window.to(),
        coveredFrom,
        window.retentionStart(),
        total,
        failed,
        max,
        cells);
  }

  /** 操作周期统计。 */
  public OperInsightResp operInsights(LogInsightRange range) {
    Window window = window(range);
    List<LogBucketResp> buckets =
        fill(
            window,
            sysOperLogMapper.insightBuckets(sqlUnit(range), window.from(), window.to()),
            SysOperLogMapper.BucketRow::bucket,
            row -> new LogBucketResp(row.bucket(), row.total(), row.succeeded(), row.failed()));
    Totals totals = Totals.of(buckets);
    long unknown = totals.total() - totals.succeeded() - totals.failed();
    Double successRate =
        totals.total() > 0 && unknown == 0 ? totals.succeeded() * 100.0 / totals.total() : null;
    long previous =
        window.previousCovered()
            ? sysOperLogMapper.countBetween(window.previousFrom(), window.from())
            : 0;
    List<OperTypeCountResp> types =
        sysOperLogMapper.typeCounts(window.from(), window.to()).stream()
            .map(row -> new OperTypeCountResp(row.type(), row.count()))
            .toList();
    return new OperInsightResp(
        range.name(),
        range.unit().name(),
        window.zone().getId(),
        window.utcOffset(),
        window.from(),
        window.to(),
        window.retentionStart(),
        totals.total(),
        totals.succeeded(),
        totals.failed(),
        unknown,
        successRate,
        window.previousCovered(),
        previous,
        buckets,
        types);
  }

  private Window window(LogInsightRange range) {
    ZoneId zone = ZoneId.systemDefault();
    LocalDateTime now =
        LocalDateTime.ofInstant(clock.instant(), zone).truncatedTo(ChronoUnit.SECONDS);
    LocalDateTime from = range.from(now);
    LocalDateTime previousFrom = from.minus(Duration.between(from, now));
    LocalDateTime retentionStart = now.minusDays(retentionDays);
    String offset = zone.getRules().getOffset(clock.instant()).getId();
    return new Window(
        range,
        zone,
        "Z".equals(offset) ? "+00:00" : offset,
        from,
        now,
        previousFrom,
        retentionStart);
  }

  private static String sqlUnit(LogInsightRange range) {
    return range.unit() == ChronoUnit.HOURS ? "hour" : "day";
  }

  /** 补齐无记录的桶为 0：空桶是“记录为零”，而不是缺失数据。 */
  private static <R> List<LogBucketResp> fill(
      Window window,
      List<R> rows,
      Function<R, LocalDateTime> key,
      Function<R, LogBucketResp> mapper) {
    Map<LocalDateTime, LogBucketResp> byStart = new HashMap<>();
    for (R row : rows) {
      byStart.put(key.apply(row), mapper.apply(row));
    }
    List<LogBucketResp> buckets = new ArrayList<>(window.range().buckets());
    LocalDateTime start = window.from();
    for (int index = 0; index < window.range().buckets(); index++) {
      LogBucketResp found = byStart.get(start);
      buckets.add(found == null ? new LogBucketResp(start, 0, 0, 0) : found);
      start = start.plus(1, window.range().unit());
    }
    return buckets;
  }

  private record Window(
      LogInsightRange range,
      ZoneId zone,
      String utcOffset,
      LocalDateTime from,
      LocalDateTime to,
      LocalDateTime previousFrom,
      LocalDateTime retentionStart) {

    boolean previousCovered() {
      return !previousFrom.isBefore(retentionStart);
    }
  }

  private record Totals(long total, long succeeded, long failed, long peak) {

    static Totals of(List<LogBucketResp> buckets) {
      long total = 0;
      long succeeded = 0;
      long failed = 0;
      long peak = 0;
      for (LogBucketResp bucket : buckets) {
        total += bucket.total();
        succeeded += bucket.succeeded();
        failed += bucket.failed();
        peak = Math.max(peak, bucket.total());
      }
      return new Totals(total, succeeded, failed, peak);
    }

    double average(int buckets) {
      return buckets == 0 ? 0 : Math.round(total * 10.0 / buckets) / 10.0;
    }
  }
}
