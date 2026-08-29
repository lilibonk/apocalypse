# Apocalypse 管理台动效规范

本规范是管理台动效的组件契约。数值事实来源为 `tokens.css`，`motion/react` 投影为 `motion.ts`。业务页面禁止自行定义另一套 duration、ease 或弹簧参数。

## 1. 设计原则

1. 动效只回答三件事：操作是否生效、内容从哪里出现、层级如何变化。
2. 数据密集表面保持可读。表格行、审计日志和权限树不逐项播放；浮层可把标题、正文区和操作区分成最多三拍快速装配。
3. 进入用于建立空间关系和年轻化品牌识别，退出更快以减少等待；允许短促关键帧超调，不使用持续回弹、果冻或低帧卡顿。
4. Canvas PixelWave 禁止在管理正文常驻；CRUD 浮层允许短暂挂载加速的 `circuit` PixelWave，结束后卸载 Canvas 与 rAF。PixelOrb 只用于登录、空态和结果反馈。

## 2. 统一节拍

| 语义        |  时长 | 缓动  | 适用组件                             |
| ----------- | ----: | ----- | ------------------------------------ |
| feedback    | 100ms | enter | hover、press、选中态、图标反馈       |
| exit        | 120ms | exit  | Tooltip、菜单、Dialog、折叠退出      |
| enter       | 200ms | enter | Tooltip、Select、Dropdown、遮罩进入  |
| layer enter | 180ms | enter | Dialog、AlertDialog 空白外壳进入     |
| content     | 240ms | enter | 浮层标题、正文区与操作区单拍进入     |
| standard    | 180ms | enter | 页面进入、侧栏宽度、真实信息折叠展开 |
| panel exit  | 160ms | exit  | Sheet / Drawer 退出                  |
| panel enter | 300ms | enter | Sheet / Drawer 进入                  |
| surface     | 800ms | enter | 空白表面、电路传导与内容浮现         |

- enter：`cubic-bezier(0.16, 1, 0.3, 1)`
- exit：`cubic-bezier(0.4, 0, 1, 1)`
- 页面位移：6px → 0；Dialog 缩放：0.92 → 1.018 → 0.994 → 1。

## 3. 组件契约

### 页面切换 `PageTransition`

- 仅新页面淡入并上移 6px，180ms；不做旧页面横向推出，避免后台任务切换产生方向误导。
- 路由切换不得让侧栏、顶栏、页签栏重新入场。

### 弹窗 `Dialog / AlertDialog`

- 遮罩先在 200ms 内建立空间，空白外壳用 180ms 从 98% 归位，退出仍保持 120ms。
- 外壳上方短暂覆盖同底色 `circuit` PixelWave；先显示纯亮色 / 暗色表面，再让一个品牌色脉冲沿固定 PCB 主路传导并在焊点处分流；分支长短与方向不对称，已通过线路仅保留低亮尾迹。每次打开拓扑与时序一致，不铺规则像素网格，不使用灰阶侧壁、立体位移或渐变。
- 覆盖层在 800ms 内淡出，0.84s 后卸载 Canvas 与 rAF；稳定态只剩正常内容表面。
- 标题延迟 460ms 再进入，正文区和操作区每拍间隔 70ms；内容从电路传导的中后段浮现。
- 禁止锯齿裁切、棋盘扫描条、四角装饰框或稳定态像素边线。
- 嵌套 Dialog 使用较轻遮罩；父层在 100ms 内后退到 97% 并降低透明度，子层关闭后立即恢复。
- 危险操作必须在确认层明确动作对象；启停与删除不可共享同一种危险色语义。

### 抽屉 `Sheet`

- 沿真实停靠边进入；进入 300ms、退出 160ms。
- 抽屉内部字段不做逐项 stagger，焦点由 Radix 接管。

### 展开 `MotionCollapse`

- 只用于确有父子信息关系的区域，例如侧栏目录、开发态外观实验室和卡片详情。
- 展开 180ms，收起 120ms；高度与透明度同步。普通统计卡片不得为了动效伪装成 disclosure。

### 浮层内容 `MotionSequence`

- 用于查看、编辑、授权等浮层内部的标题、字段和操作区，按阅读顺序依次进入。
- 序列延迟 460ms，元素间隔 70ms，单项使用 content 240ms 与 16px → -3px → 0 位移。
- 浮层只编排标题、正文区、操作区三个阶段；表格行、字段、菜单长树和分页结果禁止逐项 stagger。
- reduced-motion 或动画关闭时保持相同 DOM 顺序并直接显示。

### 反馈与微交互

- Button、Tab、Switch、命令项统一 100ms。
- 按钮按下只允许 1 个 spacing 四分之一的垂直位移；表格行不得整体移动。
- 纯图标操作必须同时提供可访问名称与 Tooltip，关闭热区不得小于 24×24。

### 品牌反馈

- `PixelScale` 是唯一的一维加载音阶；按钮、局部、页面分别使用既有 inline/card/page 变体。
- 保存、删除、启停、强退等异步写操作在原按钮内显示 inline PixelScale，成功前不提前关闭确认层。
- 登录 PixelWave 的每波噪声与形状独立随机；CRUD 浮层以 `circuit` 缩放固定 PCB 网络，只运行一次主路进入、焊点分流的加速传导并在 0.84s 后卸载。

## 4. 降级与性能

- `prefers-reduced-motion: reduce` 或 `html[data-motion='off']` 时，通用动画直接完成；PixelWave 停止渲染，PixelOrb 停止视线监听与 rAF。
- 优先只动 `transform` 与 `opacity`；`MotionCollapse` 的高度动画是信息展开场景的唯一常规例外。
- 禁止用 `transition: all` 扩散昂贵属性；新增组件应明确列出 transition-property。
- 禁止为动效引入 GSAP、Lottie、Rive 或第二套动画状态库。

## 5. 验收清单

- 明色、暗色下打开/关闭 Dialog、Sheet、Command，无闪白和主题穿透。
- 键盘焦点在动效前后不丢失；Escape 关闭后焦点回到触发器。
- 页签支持 Left / Right / Home / End，关闭按钮热区至少 24×24。
- 动画关闭和系统减少动态效果时，功能、布局和信息顺序保持不变。
- DevTools 中无持续 layout thrashing；闲置管理页无常驻品牌动画。
