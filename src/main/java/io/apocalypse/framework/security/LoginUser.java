package io.apocalypse.framework.security;

import java.util.List;

/**
 * 登录用户视图（防腐层契约）。 framework 不认识 system 模块——该 record 由 system 模块的 {@link LoginUserQuery}
 * 实现填充，framework 只消费。
 *
 * @param roles 角色标识（role_key 原值，不含前缀，签发令牌时加 {@code ROLE_} 前缀）
 * @param permissions 接口权限串（如 {@code system:user:list}，签发令牌时原样放入 authorities claim）
 */
public record LoginUser(
    Long id,
    String username,
    String password,
    boolean enabled,
    List<String> roles,
    List<String> permissions) {}
