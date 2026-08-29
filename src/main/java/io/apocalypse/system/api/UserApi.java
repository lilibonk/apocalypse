package io.apocalypse.system.api;

import java.util.Optional;

/** user 模块对外 facade（跨模块唯一入口）。 其他模块只能通过本接口与 {@link UserSummary} 访问用户域，禁止依赖 user 子包内部实现。 */
public interface UserApi {

  /** 按 ID 查询用户，不存在时抛出 {@code BizException(40400)}。 */
  UserSummary getById(Long id);

  /** 按登录名查询用户。 */
  Optional<UserSummary> findByUsername(String username);
}
