package io.apocalypse.calendar.domain;

/** 已持久导入的三层累计配额计费；包含 CSV、来源证据与每条记录的固定预留。 */
public record DataImportStorageUsage(
    long totalChargeBytes, long uploaderChargeBytes, long targetChargeBytes) {}
