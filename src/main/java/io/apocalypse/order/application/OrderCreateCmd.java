package io.apocalypse.order.application;

import java.math.BigDecimal;

/** 创建订单命令。 */
public record OrderCreateCmd(Long userId, BigDecimal amount, String remark) {}
