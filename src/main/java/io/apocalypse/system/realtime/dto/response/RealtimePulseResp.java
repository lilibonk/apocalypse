package io.apocalypse.system.realtime.dto.response;

import java.time.Instant;

/**
 * 实时脉冲负载（轻量失效信号，不含敏感业务明细）。
 *
 * @param topic 变更主题（如 {@code connected} / {@code authorizationChanged} / {@code onlineChanged}）
 * @param occurredAt 服务端发生时间戳（UTC）
 */
public record RealtimePulseResp(String topic, Instant occurredAt) {}
