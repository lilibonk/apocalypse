package io.apocalypse.common.event;

import java.time.LocalDateTime;
import java.util.UUID;

/** 登录失败事件（framework 发布、system 落库）。message 为失败原因（对外已统一为"用户名或密码错误"等中性表述）。 */
public record LoginFailedEvent(
    UUID eventId,
    LocalDateTime occurredAt,
    String username,
    String ip,
    String userAgent,
    String message) {}
