package io.apocalypse.system.user.dto.response;

import java.util.List;

/** CSV 批量导入结果统计与错误行明细。 */
public record CsvImportResultResp(
    int totalRows, int successCount, int failureCount, List<String> errors) {}
