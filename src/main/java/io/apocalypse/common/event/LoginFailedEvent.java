package io.apocalypse.common.event;

/** 登录失败事件（framework 发布、system 落库）。message 为失败原因（对外已统一为"用户名或密码错误"等中性表述）。 */
public record LoginFailedEvent(String username, String ip, String userAgent, String message) {}
