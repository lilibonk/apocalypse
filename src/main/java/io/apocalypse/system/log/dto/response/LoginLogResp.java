package io.apocalypse.system.log.dto.response;

import java.time.LocalDateTime;

/** 登录日志响应。 */
public record LoginLogResp(
    Long id,
    String username,
    String ip,
    String userAgent,
    Integer success,
    String message,
    LocalDateTime loginTime) {}
