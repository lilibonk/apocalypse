package io.apocalypse.system.log.service;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;

/** 日志统计时间范围。窗口为半开区间 {@code [from, to)}，{@code to} 为服务端 Clock 当前时刻；桶按日志记录时区对齐，最后一个桶 可能尚未结束。 */
public enum LogInsightRange {
  /** 近 24 小时：24 个小时桶。 */
  DAY(ChronoUnit.HOURS, 24),
  /** 近 7 天：7 个自然日桶。 */
  WEEK(ChronoUnit.DAYS, 7),
  /** 近 30 天：30 个自然日桶。 */
  MONTH(ChronoUnit.DAYS, 30);

  private final ChronoUnit unit;

  private final int buckets;

  LogInsightRange(ChronoUnit unit, int buckets) {
    this.unit = unit;
    this.buckets = buckets;
  }

  public ChronoUnit unit() {
    return unit;
  }

  public int buckets() {
    return buckets;
  }

  /** 第一个桶的起点：当前时刻所在桶向前回退 {@code buckets - 1} 个单位。 */
  public LocalDateTime from(LocalDateTime now) {
    return now.truncatedTo(unit).minus(buckets - 1L, unit);
  }
}
