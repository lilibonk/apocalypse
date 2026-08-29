package io.apocalypse.order.infrastructure.persistence;

import io.apocalypse.common.entity.BaseEntity;

import java.math.BigDecimal;

import com.baomidou.mybatisplus.annotation.TableName;

import lombok.Getter;
import lombok.Setter;

/** 订单持久化对象（对应 {@code order_info}）。 DO 与 domain 聚合分离，经 {@code OrderConvert} 双向转换。 */
@Getter
@Setter
@TableName("order_info")
public class OrderDo extends BaseEntity {

  private String orderNo;

  private Long userId;

  private BigDecimal amount;

  private String status;
}
