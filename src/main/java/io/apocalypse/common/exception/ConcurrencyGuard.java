package io.apocalypse.common.exception;

import io.apocalypse.common.response.ErrorCode;

/** 持久化并发保护：乐观锁冲突或并发删除必须显式失败，禁止把 0 行更新伪装成成功。 */
public final class ConcurrencyGuard {

  private ConcurrencyGuard() {}

  public static void requireSingleRow(int affectedRows) {
    if (affectedRows != 1) {
      throw new BizException(ErrorCode.CONFLICT);
    }
  }
}
