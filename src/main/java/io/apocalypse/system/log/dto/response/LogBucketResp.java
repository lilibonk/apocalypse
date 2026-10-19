package io.apocalypse.system.log.dto.response;

import java.time.LocalDateTime;

/** 统计桶。{@code start} 为日志记录时区的本地时间，桶覆盖 {@code [start, start + unit)}。 */
public record LogBucketResp(LocalDateTime start, long total, long succeeded, long failed) {}
