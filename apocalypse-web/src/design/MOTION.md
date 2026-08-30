# Apocalypse 管理台动效规范

本规范是管理台动效的组件契约。数值事实来源为 `tokens.css`，`motion/react` 投影为 `motion.ts`。业务页面禁止自行定义另一套 duration、ease 或弹簧参数。

## 1. 设计原则

1. 动效只回答三件事：操作是否生效、内容从哪里出现、层级如何变化。
2. 数据密集表面保持可读。表格行、审计日志和权限树不逐项播放；浮层可把标题、正文区和操作区分成最多三拍快速装配。
3. 进入用于建立空间关系和年轻化品牌识别，退出更快以减少等待；允许短促关键帧超调，不使用持续回弹、果冻或低帧卡顿。
4. Canvas PixelWave 禁止在管理正文常驻；Dialog、AlertDialog 与 Sheet 全部由 `PixelDialogMotion` 用 Motion 时间轴让真实内容穿过固定的不规则像素波前，PixelOrb 只用于登录、空态和结果反馈。

## 2. 统一节拍

| 语义        |  时长 | 缓动   | 适用组件                             |
| ----------- | ----: | ------ | ------------------------------------ |
| feedback    | 100ms | enter  | hover、press、选中态、图标反馈       |
| exit        | 120ms | exit   | Tooltip、菜单、Dialog、折叠退出      |
| enter       | 200ms | enter  | Tooltip、Select、Dropdown、遮罩进入  |
| overlay     | 180ms | enter  | Dialog、AlertDialog 遮罩建立         |
| standard    | 180ms | enter  | 页面进入、侧栏宽度、真实信息折叠展开 |
| panel exit  | 160ms | exit   | Sheet / Drawer 退出                  |
| panel enter | 300ms | enter  | Sheet / Drawer 进入                  |
| CRUD reveal | 500ms | linear | 全部浮层真实内容的像素波前揭示       |

- enter：`cubic-bezier(0.16, 1, 0.3, 1)`
- exit：`cubic-bezier(0.4, 0, 1, 1)`
- reveal：`linear`，让传导前沿保持恒速，禁止复用前快后慢的 enter 曲线吞掉中间帧。
- 页面位移：6px → 0；Dialog / AlertDialog 外壳缩放：0.965 → 1.008 → 1。

## 3. 组件契约

### 页面切换 `PageTransition`

- 仅新页面淡入并上移 6px，180ms；不做旧页面横向推出，避免后台任务切换产生方向误导。
- 路由切换不得让侧栏、顶栏、页签栏重新入场。

### 弹窗 `Dialog / AlertDialog`

- 遮罩在 180ms 内建立空间，外壳在 300ms 内按 `96.5% → 100.8% → 100%` 快速装配，退出仍保持 120ms。
- 禁止全表面实色遮罩、PCB 折线、散点粒子、锯齿裁切、棋盘扫描条、四角装饰框或稳定态像素边线。
- 基础 `DialogContent` 与 `AlertDialogContent` 强制挂载 `PixelDialogMotion`，不存在业务可选的旧动效分支。它保留 Radix 的焦点管理，以 `useAnimate` 同步遮罩、外壳、标题、正文和操作区；标题从 100ms、正文从 150ms、操作区从 220ms 起进入，最晚约 720ms 完成。
- 八个水平分区共用一组固定波前关键帧，各行推进距离不同；波前通过 `clip-path` 直接揭开真实标题、字段和按钮，最后一帧完整显示内容。组件不生成独立轨道、端点或装饰层。
- 波前的五帧必须保持完全相同的 polygon 顶点数，保证连续插值；初始样式由 CSS 隐藏真实内容，Motion 负责解锁，禁止用延时卸载装饰来伪装内容进入。
- 嵌套 Dialog 使用较轻遮罩；父层在 100ms 内后退到 97% 并降低透明度，子层关闭后立即恢复。
- 危险操作必须在确认层明确动作对象；启停与删除不可共享同一种危险色语义。

### 抽屉 `Sheet`

- 沿真实停靠边进入；进入 300ms、退出 160ms。
- `SheetContent` 同样强制挂载 `PixelDialogMotion`，只让内容运行同一波前，不覆盖既有的停靠边位移；焦点由 Radix 接管。

### 展开 `MotionCollapse`

- 只用于确有父子信息关系的区域，例如侧栏目录、开发态外观实验室和卡片详情。
- 展开 180ms，收起 120ms；高度与透明度同步。普通统计卡片不得为了动效伪装成 disclosure。

### 浮层内容分区

- `DialogHeader` / `AlertDialogHeader` / `SheetHeader` 自动登记为 header，Footer 同理登记为 footer；其余未标记的直属内容由 `PixelDialogMotion` 自动登记为 body。
- 特殊表单可以显式使用 `data-pixel-dialog-stage="header|body|footer"`，但不得再嵌套第二套时间轴。
- 表格行、字段、菜单长树和分页结果禁止逐项 stagger；reduced-motion 或动画关闭时保持相同 DOM 顺序并直接显示。

### 反馈与微交互

- Button、Tab、Switch、命令项统一 100ms。
- 按钮按下只允许 1 个 spacing 四分之一的垂直位移；表格行不得整体移动。
- 纯图标操作必须同时提供可访问名称与 Tooltip，关闭热区不得小于 24×24。

### 品牌反馈

- `PixelScale` 是唯一的一维加载音阶；按钮、局部、页面分别使用既有 inline/card/page 变体。
- 保存、删除、启停、强退等异步写操作在原按钮内显示 inline PixelScale，成功前不提前关闭确认层。
- 登录 PixelWave 的每波噪声与形状独立随机；全部浮层只运行固定像素波前并直接裁切真实内容，不挂载额外视觉 DOM。
- Mint Bonk 只切换批准的五张状态稿；状态帧容器允许 1–4px 整像素呼吸、踮脚、短跳或微震。登录 idle 可让原稿眼部高光以 80ms 线性响应指针，最大偏移随尺寸限制为 1–4px；不运行时重绘身体、五官和颜色。

## 4. 降级与性能

- `prefers-reduced-motion: reduce` 或 `html[data-motion='off']` 时，通用动画直接完成；PixelWave 停止渲染，PixelOrb 保持当前批准状态静态帧。
- 优先只动 `transform` 与 `opacity`；浮层的一次性 `clip-path` 揭示与 `MotionCollapse` 的高度动画是明确例外。
- 禁止用 `transition: all` 扩散昂贵属性；新增组件应明确列出 transition-property。
- 禁止为动效引入 GSAP、Lottie、Rive 或第二套动画状态库。

## 5. 验收清单

- 明色、暗色下打开/关闭 Dialog、Sheet、Command，无闪白和主题穿透。
- 键盘焦点在动效前后不丢失；Escape 关闭后焦点回到触发器。
- 页签支持 Left / Right / Home / End，关闭按钮热区至少 24×24。
- 动画关闭和系统减少动态效果时，功能、布局和信息顺序保持不变。
- DevTools 中无持续 layout thrashing；闲置管理页无常驻品牌动画。
