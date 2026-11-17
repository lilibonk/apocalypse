# Apocalypse Web 唯一因果物理动效契约（V2 宪章）

> **单一真源**：本文件定义全站物理动效的三阶时序、五通道因果耦合包络与五大性能/无障碍铁律。所有 CSS 动效变量定义在 `src/design/tokens.css`，所有 JS 动效参数统一由 `src/design/motion.ts` 的 `unifiedMotion = { tactile, spatial, causal }` 单源导出（`motionDuration`、`motionTransition`、`insightMotion`、`stateMotion`、`coupledMotion` 全部由 `unifiedMotion` 同源派生，零数值分叉）。

---

## 1. 三阶物理动效时序总表（`unifiedMotion`）

| 层级                                  | 语义 Token                                          | 时长 / 物理参数                                                      | 曲线                                     | 适用场景与硬约束                                                                          |
| ------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Tier 1<br>微触觉层<br>`tactile`**   | `tactile.feedback`                                  | `120ms` (`0.12s`)                                                    | `cubic-bezier(0.16, 1, 0.3, 1)`          | 按钮 hover/press、行悬停、胶囊微交互、开关拨动（纯 CSS 优先）                             |
|                                       | `tactile.anchor`                                    | `150ms` (`0.15s`)                                                    | `cubic-bezier(0.16, 1, 0.3, 1)`          | 点击列表行打开抽屉瞬间锁住来源行高亮（`data-origin-active`）                              |
|                                       | `tactile.popoverEnter` / `popoverExit`              | 进入 `180ms` / 退出 `140ms`                                          | 进入 `enter` / 退出 `exit`               | Select、Dropdown、Tooltip、命令面板高度自适应（`[data-adaptive]` `180ms`）                |
| **Tier 2<br>空间编排层<br>`spatial`** | `spatial.dialogFade` / `dialogEnter` / `dialogExit` | 透明度 `120ms` 线性 + 位移 `220ms` (`8px→0`, `.98→1`) / 退出 `160ms` | `cubic-bezier(0.16, 1, 0.3, 1)` / `exit` | Dialog / AlertDialog：透明度先于位移完成防透字；`inset + margin:auto` 整数像素静止        |
|                                       | `spatial.sheetEnter` / `sheetExit`                  | 进入 `280ms` / 退出 `180ms`                                          | 进入 `enter` / 退出 `exit`               | 右侧详情 `Sheet` / `ResponsiveInspector` 滑入，标题、正文与操作同步可见，无分段延迟       |
|                                       | `spatial.hud` / `spatial.morph`                     | `240ms` (`0.24s`)                                                    | `cubic-bezier(0.16, 1, 0.3, 1)`          | 空间舞台 `FloatingHud` 显隐与选中主体内容切换、登录提交按钮收拢/复原                      |
|                                       | `spatial.flip`                                      | `380ms` (`0.38s`) 或阻尼弹簧 (`stiffness: 260, damping: 28`)         | `cubic-bezier(0.22, 1, 0.36, 1)`         | 字典样本卡原地整行展开与邻卡让位、在线会话吊销离场；严格零过冲抖动，单层 Grid 边界        |
| **Tier 3<br>活水因果层<br>`causal`**  | `causal.entrance`                                   | `320ms` (`0.32s`，仅 `y: 8→0` + `opacity`，`scale: 1`)               | `cubic-bezier(0.16, 1, 0.3, 1)`          | 会话首次进入态势卡/拓扑一次性生长（总预算 `<= 650ms`）；**刷新或切页签绝不重播**          |
|                                       | `causal.pathPulse`                                  | `420ms` (`0.42s`，一次性描边脉冲)                                    | `cubic-bezier(0.16, 1, 0.3, 1)`          | 点击节点/胶囊后沿因果连线发送**单次**脉冲光斑，表达上下游传导，结束后彻底静止             |
|                                       | `causal.odometer`                                   | `460ms` (`0.46s`，列间错峰 `30ms`)                                   | `cubic-bezier(0.16, 1, 0.3, 1)`          | **每屏最多 1–2 个核心主指标**允许逐位滚轮（`hero-odometer`），其余一律静默 `tabular-nums` |

---

## 2. 五通道因果耦合包络（Coupled Motion Envelope）

当用户在空间工作台触发一次选中、下钻或状态变更时，五个视觉通道在统一的 `150ms–460ms` 因果时间窗内协同响应（由 `CoupledMotionGroup` 与动效原语编排）：

1. **Channel 1 — 来源锚定（`OriginAnchor` / `data-origin-active`，`150ms`）**：触发行或触发节点立即锁定品牌浅底与内侧强调边，直至详情抽屉关闭并归还焦点。
2. **Channel 2 — 单次路径脉冲（`PathPulse`，`420ms`）**：沿关联 SVG 贝塞尔路径发射一次光斑脉冲，动画完成即卸载光斑节点，静止后零 `rAF`。
3. **Channel 3 — 单边界 FLIP 让位（`FlipExpandGrid`，`380ms`）**：展开卡独占整行（`grid-column: 1 / -1`），邻卡平滑重排让位；子卡片禁止挂载 `container-type` 以防布局循环。
4. **Channel 4 — 悬浮 HUD 切换（`HudTransition`，`240ms`）**：四角 `FloatingHud` 与检视器内容随选中实体切换平滑过渡，容器保持 `height: fit-content`。
5. **Channel 5 — 主指标滚轮（`MetricValue`，`460ms`）**：仅核心 1–2 项英雄指标执行逐位滚轮（`variant="hero-odometer"`），次级指标走零额外 DOM 的 `tabular-nums`（`variant="tabular"`）。

---

## 3. 五大动效铁律（Performance & A11y Gates）

1. **有因才有果，静止零开销（`idle rAF === 0`）**：业务工作区严禁任何无限循环呼吸灯、粒子流光或伪实时跳字；交互完成 1 秒后浏览器 `requestAnimationFrame` 增量必须为 `0`。
2. **随时可打断，绝不锁业务**：用户连续点击切换角色、行或时间窗时，动画在当前帧平滑转向新目标；任何按钮点击、表单输入与保存提交绝不等待动画结束。
3. **弹层零整表重渲**：打开 Dialog / Sheet 时只渲染弹层与来源锚定行，列表行组件与回调保持记忆化，杜绝动画首帧掉帧。
4. **双开关首帧即终态**：统一经 `useMotionPreference()` 合并系统 `prefers-reduced-motion` 与应用内外观开关（`html[data-motion='off']`）；业务与特效代码禁止裸调 `useReducedMotion()`。关闭状态下跳过一切位移、滚轮与脉冲，首帧直达终态；当 `sessionEpoch` 或 `authorizationEpoch` 变化时立即中止在途过渡。
5. **单表面单引擎与品牌角色隔离**：同一 DOM 表面禁止叠加两套动画引擎；WebGPU 交互角色（`Milk Cloud / Apo`）严格限定在 `/login` 登录门户，业务管理台等待反馈统一使用 `PulseIndicator`。
