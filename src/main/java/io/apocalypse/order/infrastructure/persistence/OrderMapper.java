package io.apocalypse.order.infrastructure.persistence;

import io.apocalypse.common.response.PageResult;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;

/** 订单 Mapper。MP 类型封装在 default 方法内（约定同 user 模块 mapper 包）。 */
public interface OrderMapper extends BaseMapper<OrderDo> {

  /** 分页（按创建时间倒序）。 */
  default PageResult<OrderDo> pageAll(int page, int size) {
    return PageResult.of(
        selectPage(
            new Page<>(page, size),
            new LambdaQueryWrapper<OrderDo>().orderByDesc(OrderDo::getCreateTime)));
  }

  /** 按买家分页（按创建时间倒序）。 */
  default PageResult<OrderDo> pageByUserId(Long userId, int page, int size) {
    return PageResult.of(
        selectPage(
            new Page<>(page, size),
            new LambdaQueryWrapper<OrderDo>()
                .eq(OrderDo::getUserId, userId)
                .orderByDesc(OrderDo::getCreateTime)));
  }
}
