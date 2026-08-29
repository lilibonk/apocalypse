/**
 * system 模块：系统管理域（用户/角色/菜单/部门/字典/参数/日志/在线用户，简单域形态）。 对外暴露面统一 {@code api} 包（facade +
 * 共享视图）；各子域（user/role/menu/dept/dict/config/log/online）内部按 controller/service/mapper/entity/dto
 * 分层，{@code listener} 包承接跨模块事件消费。
 */
package io.apocalypse.system;
