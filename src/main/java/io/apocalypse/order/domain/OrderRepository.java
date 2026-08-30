package io.apocalypse.order.domain;

import io.apocalypse.common.response.PageResult;

import java.util.Optional;

/** 订单仓储端口（domain 定义，infrastructure 以 MyBatis-Plus 实现——依赖方向指向 domain）。 */
public interface OrderRepository {

  /** 保存（无 ID 插入、有 ID 更新），返回带主键的聚合。 */
  Order save(Order order);

  /** 按 ID 查询（逻辑删除自动过滤）。 */
  Optional<Order> findById(Long id);

  /** 分页（按创建时间倒序）。 */
  PageResult<Order> page(int page, int size);

  /** 按买家分页（对象级授权查询）。 */
  PageResult<Order> pageByUserId(Long userId, int page, int size);
}
