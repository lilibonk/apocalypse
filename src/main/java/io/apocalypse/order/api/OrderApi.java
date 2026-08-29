package io.apocalypse.order.api;

/** order 模块对外 facade。 跨模块只允许依赖本 api 包（NamedInterface），domain/application/infrastructure 均为内部实现。 */
public interface OrderApi {

  /** 按 ID 查询订单，不存在时抛出 {@code BizException(40400)}。 */
  OrderView getById(Long id);
}
