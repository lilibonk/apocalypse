/**
 * order 模块对外契约包：facade（{@code OrderApi}）与视图（{@code OrderView}）。 集成事件契约见 common.event
 * 共享内核（避免模块循环依赖，原因见该类注释）。
 */
@org.springframework.modulith.NamedInterface("api")
package io.apocalypse.order.api;
