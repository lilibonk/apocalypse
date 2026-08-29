package io.apocalypse.order.interfaces;

import io.apocalypse.common.response.PageResult;
import io.apocalypse.order.api.OrderView;
import io.apocalypse.order.application.OrderApplicationService;
import io.apocalypse.order.application.OrderCreateCmd;

import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;

/** 订单端点：下单 / 详情 / 分页。仅需认证（订单属业务操作，未挂菜单 perms）。 */
@RestController
@RequestMapping("/orders")
@RequiredArgsConstructor
public class OrderController {

  private final OrderApplicationService orderApplicationService;

  /** 下单。 */
  @PostMapping
  public OrderView create(@Validated @RequestBody OrderCreateReq req) {
    return orderApplicationService.createOrder(
        new OrderCreateCmd(req.userId(), req.amount(), req.remark()));
  }

  /** 详情。 */
  @GetMapping("/{id}")
  public OrderView getById(@PathVariable Long id) {
    return orderApplicationService.getById(id);
  }

  /** 分页。 */
  @GetMapping("/page")
  public PageResult<OrderView> page(
      @RequestParam(defaultValue = "1") int page, @RequestParam(defaultValue = "10") int size) {
    return orderApplicationService.page(page, size);
  }
}
