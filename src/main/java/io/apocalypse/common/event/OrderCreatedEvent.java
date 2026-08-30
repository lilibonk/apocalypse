package io.apocalypse.common.event;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 订单创建事件（跨模块集成事件契约）。
 *
 * <p>放置说明：本事件由 order 模块发布、user 模块消费。若放在 order.api，user 消费事件与 order 调用 user 根包 facade 会形成 order ↔
 * user 模块循环，Modulith {@code verify()} 的循环检测不通过；故事件契约沉淀到 OPEN 共享内核（common.event），发布方与消费方都只依赖
 * common，模块依赖图保持无环。
 */
public record OrderCreatedEvent(
    UUID eventId,
    LocalDateTime occurredAt,
    Long orderId,
    String orderNo,
    Long userId,
    BigDecimal amount) {}
