package io.apocalypse.order.infrastructure;

import io.apocalypse.order.domain.Order;
import io.apocalypse.order.domain.OrderStatus;
import io.apocalypse.order.infrastructure.persistence.OrderDo;

import org.mapstruct.Mapper;
import org.mapstruct.MappingConstants;

/** 订单 DO ↔ domain 聚合转换（MapStruct）。 */
@Mapper(componentModel = MappingConstants.ComponentModel.SPRING)
public interface OrderConvert {

  /** domain → DO（status 枚举自动按名称转字符串；审计字段由 MP 填充，不映射）。 */
  OrderDo toDo(Order order);

  /** DO → domain：经还原工厂重建聚合，不走新建校验。 */
  default Order toDomain(OrderDo orderDo) {
    return Order.rehydrate(
        orderDo.getId(),
        orderDo.getOrderNo(),
        orderDo.getUserId(),
        orderDo.getAmount(),
        OrderStatus.valueOf(orderDo.getStatus()),
        orderDo.getRemark());
  }
}
