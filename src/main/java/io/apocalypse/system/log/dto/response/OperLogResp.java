package io.apocalypse.system.log.dto.response;

import java.time.LocalDateTime;

/** 操作日志响应。 */
public record OperLogResp(
    Long id,
    String title,
    String businessType,
    String method,
    String operName,
    String operIp,
    String operParam,
    String operResult,
    Integer status,
    String errorMsg,
    LocalDateTime operTime,
    Long costTime) {}
