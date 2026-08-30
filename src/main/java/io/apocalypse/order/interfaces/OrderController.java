package io.apocalypse.order.interfaces;

import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.common.response.PageResult;
import io.apocalypse.framework.security.SecurityUtils;
import io.apocalypse.order.api.OrderView;
import io.apocalypse.order.application.OrderApplicationService;
import io.apocalypse.order.application.OrderCreateCmd;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;

/** 订单端点：显式 RBAC + 对象级所有权校验；普通用户只能操作自己的订单。 */
@Validated
@RestController
@RequestMapping("/orders")
@RequiredArgsConstructor
public class OrderController {

  private final OrderApplicationService orderApplicationService;

  /** 下单。 */
  @PostMapping
  @PreAuthorize("hasAuthority('order:create')")
  public OrderView create(@Validated @RequestBody OrderCreateReq req) {
    Long userId = currentUserId();
    return orderApplicationService.createOrder(
        new OrderCreateCmd(userId, req.amount(), req.remark()));
  }

  /** 详情。 */
  @GetMapping("/{id}")
  @PreAuthorize("hasAnyAuthority('order:read', 'order:read:any')")
  public OrderView getById(@PathVariable Long id) {
    return orderApplicationService.getByIdForUser(
        id, currentUserId(), SecurityUtils.hasAuthority("order:read:any"));
  }

  /** 分页。 */
  @GetMapping("/page")
  @PreAuthorize("hasAnyAuthority('order:list', 'order:list:any')")
  public PageResult<OrderView> page(
      @RequestParam(defaultValue = "1") @Min(value = 1, message = "页码必须大于 0") int page,
      @RequestParam(defaultValue = "10")
          @Min(value = 1, message = "每页条数必须大于 0")
          @Max(value = 200, message = "每页条数不能超过 200")
          int size) {
    return orderApplicationService.pageForUser(
        page, size, currentUserId(), SecurityUtils.hasAuthority("order:list:any"));
  }

  private static Long currentUserId() {
    return SecurityUtils.currentUserId()
        .orElseThrow(() -> new BizException(ErrorCode.UNAUTHORIZED));
  }
}
