package io.apocalypse.common.response;

import java.io.Serializable;
import java.util.List;
import java.util.function.Function;

import com.baomidou.mybatisplus.core.metadata.IPage;

/**
 * 统一分页结果。注意：本类型属于 common 对外契约，内部封禁 MyBatis-Plus 类型的外泄—— MP 的 {@code Page} 只允许在
 * mapper/infrastructure 层使用，跨层传递一律转换为本类型。
 */
public record PageResult<T>(List<T> list, long total, long page, long size)
    implements Serializable {

  /** 从 MyBatis-Plus 分页对象转换（元素原样保留）。 */
  public static <T> PageResult<T> of(IPage<T> page) {
    return new PageResult<>(page.getRecords(), page.getTotal(), page.getCurrent(), page.getSize());
  }

  /** 从 MyBatis-Plus 分页对象转换，并对元素做 DO → DTO 映射。 */
  public static <S, T> PageResult<T> of(IPage<S> page, Function<S, T> mapper) {
    return new PageResult<>(
        page.getRecords().stream().map(mapper).toList(),
        page.getTotal(),
        page.getCurrent(),
        page.getSize());
  }

  /** 元素映射（DO → DTO 等），分页元数据保持不变。 */
  public <U> PageResult<U> map(Function<T, U> mapper) {
    return new PageResult<>(list.stream().map(mapper).toList(), total, page, size);
  }
}
