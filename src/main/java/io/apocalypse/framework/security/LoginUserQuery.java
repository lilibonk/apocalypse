package io.apocalypse.framework.security;

import java.util.Optional;

/**
 * 登录用户查询端口（防腐接口）。 由 system 模块提供实现并注册为 Spring Bean；framework 通过 ObjectProvider
 * 惰性获取，无实现时登录接口返回"登录能力未接入"而不是启动失败。
 *
 * <p>方法名刻意避开 {@code findByUsername}：实现方（system 模块）同时实现对外 facade {@code UserApi.findByUsername}，
 * 同名同参不同返回值无法共存于一个类。
 */
public interface LoginUserQuery {

  /** 按用户名查询登录用户，password 为密文（BCrypt）。 */
  Optional<LoginUser> findLoginUserByUsername(String username);
}
