package io.apocalypse.system.log.dto.response;

import java.time.LocalDateTime;
import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

/** 操作日志周期统计；状态既非成功也非失败的记录计入 {@code unknown}，此时不给出成功率。 */
public record OperInsightResp(
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
    long unknown,
    @Schema(nullable = true) Double successRate,
    boolean previousCovered,
    long previousTotal,
    List<LogBucketResp> buckets,
    List<OperTypeCountResp> byBusinessType) {}
