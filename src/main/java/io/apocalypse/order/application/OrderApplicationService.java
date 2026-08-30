package io.apocalypse.order.application;

import io.apocalypse.common.event.OrderCreatedEvent;
import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.common.response.PageResult;
import io.apocalypse.order.api.OrderApi;
import io.apocalypse.order.api.OrderView;
import io.apocalypse.order.domain.Order;
import io.apocalypse.order.domain.OrderRepository;
import io.apocalypse.system.api.UserApi;
import io.apocalypse.system.api.UserSummary;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/** 订单应用服务：编排下单流程（校验 → 构造聚合 → 仓储保存 → 发布事件），事务边界在本层。 */
@Slf4j
@Service
@RequiredArgsConstructor
public class OrderApplicationService implements OrderApi {

  private final OrderRepository orderRepository;

  private final UserApi userApi;

  private final ApplicationEventPublisher eventPublisher;

  /** 下单：经 user 模块 facade 校验买家存在（跨模块只走 facade，不允许碰 user 内部实现）。 */
  @Transactional
  public OrderView createOrder(OrderCreateCmd cmd) {
    UserSummary buyer = userApi.getById(cmd.userId());
    Order order = Order.create(generateOrderNo(), buyer.id(), cmd.amount(), cmd.remark());
    Order saved = orderRepository.save(order);
    // 事务内发布：Modulith 将事件写入 event_publication，提交后由 user 模块异步消费
    eventPublisher.publishEvent(
        new OrderCreatedEvent(
            UUID.randomUUID(),
            LocalDateTime.now(),
            saved.getId(),
            saved.getOrderNo(),
            saved.getUserId(),
            saved.getAmount()));
    log.info("订单创建成功: orderNo={}, userId={}", saved.getOrderNo(), buyer.id());
    return toView(saved);
  }

  @Override
  public OrderView getById(Long id) {
    return orderRepository
        .findById(id)
        .map(OrderApplicationService::toView)
        .orElseThrow(() -> new BizException(ErrorCode.NOT_FOUND.getCode(), "订单不存在"));
  }

  /** HTTP 入口读取：无全局读取权限时强制校验订单所有权。 */
  public OrderView getByIdForUser(Long id, Long userId, boolean readAny) {
    Order order = requireById(id);
    if (!readAny && !order.getUserId().equals(userId)) {
      // 不泄漏订单是否存在，跨用户访问统一按资源不存在处理。
      throw new BizException(ErrorCode.NOT_FOUND.getCode(), "订单不存在");
    }
    return toView(order);
  }

  /** 分页查询。 */
  public PageResult<OrderView> page(int page, int size) {
    return orderRepository.page(page, size).map(OrderApplicationService::toView);
  }

  /** HTTP 入口分页：管理员查全部，普通用户只查自己的订单。 */
  public PageResult<OrderView> pageForUser(int page, int size, Long userId, boolean readAny) {
    PageResult<Order> result =
        readAny
            ? orderRepository.page(page, size)
            : orderRepository.pageByUserId(userId, page, size);
    return result.map(OrderApplicationService::toView);
  }

  private Order requireById(Long id) {
    return orderRepository
        .findById(id)
        .orElseThrow(() -> new BizException(ErrorCode.NOT_FOUND.getCode(), "订单不存在"));
  }

  private static OrderView toView(Order order) {
    return new OrderView(
        order.getId(),
        order.getOrderNo(),
        order.getUserId(),
        order.getAmount(),
        order.getStatus().name(),
        order.getRemark());
  }

  /** 订单号：时间戳 + 随机后缀（脚手架级唯一性，生产建议号段/雪花）。 */
  private static String generateOrderNo() {
    return "O"
        + DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS").format(LocalDateTime.now())
        + ThreadLocalRandom.current().nextInt(1000, 10000);
  }
}
