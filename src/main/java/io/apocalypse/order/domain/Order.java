package io.apocalypse.order.domain;

import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;

import java.math.BigDecimal;

import lombok.Getter;

/** 订单聚合根（纯领域：不依赖 Spring / MyBatis-Plus，见 ArchUnit R4）。 不变量：金额必须为正；状态机仅允许 PENDING → CANCELLED。 */
@Getter
public class Order {

  private Long id;

  private final String orderNo;

  private final Long userId;

  private final BigDecimal amount;

  private OrderStatus status;

  private final String remark;

  private Order(
      Long id, String orderNo, Long userId, BigDecimal amount, OrderStatus status, String remark) {
    this.id = id;
    this.orderNo = orderNo;
    this.userId = userId;
    this.amount = amount;
    this.status = status;
    this.remark = remark;
  }

  /** 新建订单：金额必须大于 0，初始状态 PENDING。 */
  public static Order create(String orderNo, Long userId, BigDecimal amount, String remark) {
    if (orderNo == null || orderNo.isBlank()) {
      throw new BizException(ErrorCode.PARAM_INVALID.getCode(), "订单号不能为空");
    }
    if (userId == null) {
      throw new BizException(ErrorCode.PARAM_INVALID.getCode(), "买家不能为空");
    }
    if (amount == null || amount.signum() <= 0) {
      throw new BizException(ErrorCode.PARAM_INVALID.getCode(), "订单金额必须大于 0");
    }
    return new Order(null, orderNo, userId, amount, OrderStatus.PENDING, remark);
  }

  /** 从持久化数据还原聚合（仅 infrastructure 层使用，跳过不变量校验）。 */
  public static Order rehydrate(
      Long id, String orderNo, Long userId, BigDecimal amount, OrderStatus status, String remark) {
    return new Order(id, orderNo, userId, amount, status, remark);
  }

  /** 取消订单：仅待处理状态可取消，非法转换抛业务异常。 */
  public void cancel() {
    if (status != OrderStatus.PENDING) {
      throw new BizException(ErrorCode.BIZ_ERROR.getCode(), "仅待处理订单可取消");
    }
    this.status = OrderStatus.CANCELLED;
  }

  /** 持久化回填主键（仅 infrastructure 层使用）。 */
  public void assignId(Long id) {
    this.id = id;
  }
}
