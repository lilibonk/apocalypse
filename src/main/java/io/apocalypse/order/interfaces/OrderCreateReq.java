package io.apocalypse.order.interfaces;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

/** 创建订单请求。 */
public record OrderCreateReq(
    @NotNull(message = "订单金额不能为空") @DecimalMin(value = "0.01", message = "订单金额必须大于 0")
        BigDecimal amount,
    @Size(max = 255, message = "备注最长 255 字符") String remark) {}
