package io.apocalypse.system.log.dto.response;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 登录日志周期统计。全部来自服务端聚合，时间为日志记录时区（{@code zone}/{@code utcOffset}）的本地时间。
 *
 * <p>{@code previousTotal} 为紧邻的同长度上一窗口；该窗口早于保留期起点时 {@code previousCovered=false}，此时不可比较。
 */
public record LoginInsightResp(
    String range,
    String bucketUnit,
    String zone,
    String utcOffset,
    LocalDateTime from,
    LocalDateTime to,
    LocalDateTime retentionStart,
    long total,
    long succeeded,
    long failed,
    long distinctUsers,
    long distinctIps,
    long peak,
    double average,
    boolean previousCovered,
    long previousTotal,
    List<LogBucketResp> buckets) {}
