package io.apocalypse.common.event;

/** 登录成功事件（framework 发布、system 落库）。 事件契约统一沉淀 OPEN 共享内核，保持模块依赖图无环（约定见 AGENTS.md §4）。 */
public record LoginSucceededEvent(String username, String ip, String userAgent) {}
