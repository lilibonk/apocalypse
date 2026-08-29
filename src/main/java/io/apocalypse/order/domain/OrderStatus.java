package io.apocalypse.order.domain;

/** 订单状态机：PENDING（待处理）→ CANCELLED（已取消）。 */
public enum OrderStatus {
  PENDING,
  CANCELLED
}
