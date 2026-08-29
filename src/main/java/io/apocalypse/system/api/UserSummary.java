package io.apocalypse.system.api;

/** 用户摘要（跨模块共享视图）。 只暴露其他模块需要的最小字段，密码等敏感信息不出 user 模块。 */
public record UserSummary(Long id, String username, String nickname) {}
