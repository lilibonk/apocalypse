/**
 * system 模块对外契约包：facade（{@code UserApi}）与共享视图（{@code UserSummary}）。 集成事件契约统一放 common.event
 * 共享内核（避免模块循环依赖，约定见 AGENTS.md §4）。
 */
@org.springframework.modulith.NamedInterface("api")
package io.apocalypse.system.api;
