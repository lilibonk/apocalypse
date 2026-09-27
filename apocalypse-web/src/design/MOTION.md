# 管理台动效契约

2026-09-27：随苹果应用式视觉迁移生效。设计方向见 [DEFINITION.md](./DEFINITION.md)，数值在 tokens.css 与 motion.ts 对齐。

| 语义      |  时长 | 行为                         |
| --------- | ----: | ---------------------------- |
| feedback  | 120ms | hover、press、选中           |
| exit      | 160ms | 菜单/浮层退出                |
| enter     | 180ms | Select、Dropdown、Tooltip    |
| layer     | 220ms | Dialog、AlertDialog 整体进入 |
| standard  | 200ms | 页面和已有信息展开           |
| panel     | 280ms | Sheet / Drawer 方向性进入    |
| panelExit | 180ms | Sheet / Drawer 退出          |

1. 标题、正文和操作随同一浮层立即存在并同步可见，不再单独按像素波前裁切或延迟。
2. 焦点管理继续使用 Radix 与现有 layer-focus-return；编辑表单初始焦点策略保持，关闭返回触发器。
3. CSS 能完成的浮层使用 CSS；Motion 继续用于已有页面/折叠。禁止多引擎叠加一个表面。
4. prefers-reduced-motion 与 data-motion='off' 下无非必要运动，内容不等待动画结束事件。
5. 等待反馈保留 PixelScale API，圆润、连续、低开销；品牌气泡采用柔和形状。PixelWave 仍限开发实验室。
6. 角色运行内核遵循独立交付与同一动效开关，前端风格迁移不改造角色物理。
7. 测试覆盖整体可见、双开关和焦点连接；真实浏览器覆盖 Escape、焦点返回、长内容滚动及连续打开关闭。
