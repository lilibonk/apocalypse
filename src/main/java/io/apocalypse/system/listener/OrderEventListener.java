package io.apocalypse.system.listener;

import io.apocalypse.common.event.OrderCreatedEvent;

import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/**
 * 跨模块事件消费范例：监听 order 模块发布的 {@link OrderCreatedEvent}。 {@code @ApplicationModuleListener} =
 * 事务提交后异步消费 + 事件登记表留痕（event_publication）。
 *
 * <p>事件契约放在 OPEN 共享内核 common.event（而非 order.api）：user 消费事件若依赖 order.api，会与 order 调用 user 根包 facade
 * 形成模块循环（Modulith verify 拒绝）；消费方因此只依赖 common，不接触 order 任何包。
 */
@Slf4j
@Component
public class OrderEventListener {

  /** 订单创建后触发。1 期仅打日志示例；后续可在此累计用户下单数等业务动作（注意幂等——事件可能重投）。 */
  @ApplicationModuleListener
  public void onOrderCreated(OrderCreatedEvent event) {
    log.info(
        "收到订单创建事件: orderId={}, orderNo={}, userId={}, amount={}",
        event.orderId(),
        event.orderNo(),
        event.userId(),
        event.amount());
  }
}
