package io.apocalypse.system.online.dto.response;

import java.time.LocalDateTime;

/** 在线用户响应。 */
public record OnlineUserResp(
    String jti, String username, LocalDateTime loginTime, String ip, String userAgent) {}
