package io.apocalypse.order.api;

import java.math.BigDecimal;

/** 订单对外视图（跨模块契约，status 以字符串暴露，不外泄 domain 枚举）。 */
public record OrderView(
    Long id, String orderNo, Long userId, BigDecimal amount, String status, String remark) {}
