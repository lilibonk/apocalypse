package io.apocalypse.system.file.dto.response;

/** 文件存储配额概览。 */
public record FileQuotaSummaryResp(
    long usedUserBytes,
    long userQuotaBytes,
    long usedTotalBytes,
    long totalQuotaBytes,
    long maxFileSizeBytes,
    long activeFileCount) {}
