package io.apocalypse.system.user.dto.response;

import java.time.LocalDateTime;

/** 当前登录用户的单条活跃会话视图（{@code current=true} 标识当前请求所持令牌）。 */
public record SelfSessionResp(
    String jti, LocalDateTime loginTime, String ip, String userAgent, boolean current) {}
