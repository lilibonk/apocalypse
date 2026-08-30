package io.apocalypse.order.infrastructure;

import io.apocalypse.common.exception.ConcurrencyGuard;
import io.apocalypse.common.response.PageResult;
import io.apocalypse.order.domain.Order;
import io.apocalypse.order.domain.OrderRepository;
import io.apocalypse.order.infrastructure.persistence.OrderDo;
import io.apocalypse.order.infrastructure.persistence.OrderMapper;

import java.util.Optional;

import org.springframework.stereotype.Repository;

import lombok.RequiredArgsConstructor;

/** 订单仓储实现（MyBatis-Plus + MapStruct）。 domain 只依赖接口，实现细节留在 infrastructure。 */
@Repository
@RequiredArgsConstructor
public class OrderRepositoryImpl implements OrderRepository {

  private final OrderMapper orderMapper;

  private final OrderConvert orderConvert;

  @Override
  public Order save(Order order) {
    OrderDo orderDo = orderConvert.toDo(order);
    if (orderDo.getId() == null) {
      orderMapper.insert(orderDo);
      order.assignId(orderDo.getId());
    } else {
      ConcurrencyGuard.requireSingleRow(orderMapper.updateById(orderDo));
    }
    return order;
  }

  @Override
  public Optional<Order> findById(Long id) {
    return Optional.ofNullable(orderMapper.selectById(id)).map(orderConvert::toDomain);
  }

  @Override
  public PageResult<Order> page(int page, int size) {
    return orderMapper.pageAll(page, size).map(orderConvert::toDomain);
  }

  @Override
  public PageResult<Order> pageByUserId(Long userId, int page, int size) {
    return orderMapper.pageByUserId(userId, page, size).map(orderConvert::toDomain);
  }
}
