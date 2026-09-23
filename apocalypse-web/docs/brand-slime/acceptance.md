# LIL-85 · 第一版验收记录

> 本页保留第一版历史，不把下方测量当作当前版本结果。当前品牌行为与约束见[设计定义](../../src/design/DEFINITION.md)和[前端 AGENTS.md](../../AGENTS.md)；第二版原始验收证据保存在产品维护知识库，不是使用脚手架的前置资料。

> 下列旧版截图、录屏、性能 JSON 与 `revision-03.md` 已逐文件校验后归档至 Apocalypse 产品知识库，当前源码树不再随包保存。文件名和历史测量保持原样；在 Git 提交 `790eaab` 可按原路径回读。

2026-09-08：用户明确“第一版验收提交”，接受包含修订 03 暗色冰翡翠配色的当前第一版，并授权本地 Git 提交；未授权推送。修订过程及用户范围调整见 `revision-01.md`；最新暗色配色见 `revision-03.md`。本次接受不扩大下文已验证的设备、性能或服务端联调范围。

## 验收入口

- [实际登录页：生产构建](http://127.0.0.1:4173/login)：桌面 384px / 手机 256px，按住揉捏、拖动拎起、松手回弹，密码框聚焦闭眼。
- [独立验收页](http://127.0.0.1:4174/docs/brand-slime/preview.html)：目标对照、五状态、性能、设备丢失；点“开始交互”后揉捏。可录制 12 秒画布交互，不申请麦克风或系统录屏权限。
- [开发态组件检查](http://127.0.0.1:5173/docs/brand-slime/preview.html) → “打开真实组件检查”：全局设置沿用现有 DEV 实验室约定；生产不额外开放设置入口，DOM data-motion=off 和系统 reduced-motion 仍生效。

这些是本机地址，不是已部署/分享站点。普通生产构建不包含独立验收文档，无新增业务路由或认证绕过。

## 建议人工检查

1. 看明暗主题是否自动切换角色材质与海报；浅色 mint / 暗色冰翡翠绿，深色背景上的身体与五官层次更分明。
2. 按住脸附近看局部凹陷；向上拖动、松手，检查回弹、轻重力及落地挤压是否像软肉。
3. 鼠标按压不出现整块选框；Tab 聚焦仍可见，空格/回车戳动、Escape 松手。idle 眼睛沿皮肤跟随鼠标。
4. 聚焦密码框看闭眼；等待/成功/失败用独立验收页切换，不必提交真实密码。
5. 检查动画总开关/卸载重挂/设备丢失。无 GPU 时静态降级且明确说明，不能切为 WebGL。
6. 气泡应是体内细小、透明的缓慢上浮，轻微横漂，没有银色亮珠圈、正弦往返或可见重生跳跃；连续证据 `revision-02-bubbles.webm`。这是一种参考体验近似，最终体验由用户判断。
7. 登录无像素浪潮。开发态“界面设置 → 外观实验室 → 动效实验室 → 像素浪潮”默认关闭，仅开启时在实验室局部预览；关闭/收起/关闭设置应卸载，不影响登录。

## 交付物与边界

- 目标图：`target-v1.png`（内置 ImageGen）；提示词和方案比较：`solution-fit.md`。
- 本次并排对照：`revision-02-comparison-light.png`。`comparison-01.png` 至 `comparison-06.png` 为初版历史，不代表人工反馈已通过。
- 本次页面：`revision-02-login-light.png`、`revision-02-login-dark.png`、`revision-02-mobile-light.png`、`revision-02-mobile-dark.png`。初版 login-*.png 仅保留历史。
- 最新暗色改色证据：`revision-03-dark-comparison.png`、`revision-03-login-dark.png`、`revision-03-login-light.png`、`revision-03-mobile-dark.png`、`revision-03-static-dark.png`；暗色五状态海报同源更新，亮色未改。
- 交互：`pressed.png`、`drag-release.png`、`keyboard-poke.png`、`interaction.webm`。
- 回退：初版 `static-fallback.png`、`device-lost.png`；本次透明明暗各五状态海报：`public/brand/slime/`，均由最终场景重新导出。
- 设计 QA：项目根 `design-qa.md`，实现级 passed；用户于 2026-09-08 接受当前第一版。
- PixelOrb 保留兼容签名，转向新 Slime；小尺寸空态只使用新海报。登录不挂载 PixelWave，后者仅保留为默认关闭的开发态实验室预览。PixelScale 进度、BrandSignature/favicon 及认证逻辑保持。
- 仅新增精确锁定 three@0.185.1 与 @types/three@0.185.4；引擎限定 effects/webgpu。使用 Renderer + WebGPUBackend + StandardNodeLibrary，getFallback:null，不使用默认带 WebGL fallback 的 WebGPURenderer。
- 固定步长弹簧、局部形变与体积感补偿，不是全粒子材料仿真；网格、眼睛、嘴与气泡共享形变。没有新增物理运行时、远程 HDR/CDN 或联网资产加载。

## 性能证据

下列为修订 02 的采样；修订 03 仅改变颜色与对应海报，没有增加渲染负载，也没有重新采样，不将旧记录冒充改色后的新测量。

生产构建场景，预热 10 秒后采集至少 60 秒；循环含静置、保持按压、拖拽与释放落地。另有实际鼠标/键盘操作验证，不将脚本负载当作完整输入测试。初版原始记录 `performance-60s.json`（7201 帧 / 120.00 FPS）仅为历史；中途被窗口尺寸变化中断的 `revision-01-performance-60s.json` 无效，不作为通过依据。

| 项目         | 实测                                                    |
| ------------ | ------------------------------------------------------- |
| 设备         | MacBook Pro Mac17,2 / Apple M5 / 32GB                   |
| OS           | macOS 26.6.2（25G83），不使用 UA 伪装的 10_15_7         |
| 浏览器       | Codex 内置 Chromium / Chrome 152.0.0.0                  |
| 后端         | WebGPU / apple / metal-3                                |
| 视口/渲染    | 1280×720 CSS；角色 640×640 CSS；DPR 2；buffer 1280×1280 |
| 当前样本     | 7129 帧 / 60007.7 ms；phase=complete                    |
| 平均 FPS     | 118.80                                                  |
| p95 帧间隔   | 9.30 ms                                                 |
| >25ms 帧间隔 | 0                                                       |

当前负载：56 枚体内透明气泡，上浮/淡出/重生、gaze 与软体混合交互，无 PixelWave（与登录最终范围一致）。指标为 rAF 提交渲染帧间隔，不是 GPU timestamp 或显示呈现延迟；不声明手机/低端/所有浏览器同样通过。DPR 固定上限 2，无隐含动态降分辨率。

## 验证与限制

- 第一版提交前重新执行 `pnpm format` 与 `pnpm check`：格式、oxlint、ESLint、Vitest、TypeScript、生产构建通过；39 文件 / 288 测试（2026-09-08）。
- 自动化覆盖：物理极值/回弹/步长，五官表面锚定与 gaze，单向气泡上浮/隐藏重生/边界/非金属体积分布，焦点输入模式，实验室默认关闭/开关挂载/生产关闭/能力裁剪，strict GPU fail-closed/abort/cleanup，SSR 明暗海报与减少动效组合，真实 ESLint 引擎分域规则。
- 浏览器覆盖：正式登录明暗/390px/中英文空表单/密码闭眼，实际拖拽/空格，DEV 总开关、DOM 开关、卸载/重挂，实际 GPUDevice.destroy。正式页及设备丢失页 console error 为空。
- reduced-motion 分支由自动化覆盖，未改 OS 设置；后台暂停、异常指针取消做实现审查，未模拟真实驱动崩溃/OS 挂起。
- 原有 8 条 lint warning（Fast Refresh/React Hook Form）与大 chunk 提醒仍保留，无 error。WebGPU 引擎仅在大角色可见且允许动画时延迟加载，本次构建约 217.51KB gzip。
- 后端提交门禁：使用工作区 Temurin 25.0.4.1+1、项目 Maven Wrapper 3.9.16 和既有 Colima socket，执行 `./mvnw --batch-mode spotless:apply`、`./mvnw --batch-mode verify`，均 BUILD SUCCESS。单元/架构测试、Testcontainers 集成测试、Enforcer、Spotless 与 Checkstyle 通过；集成测试报告 84 项，83 通过、1 跳过、0 失败/错误。跳过项为原有需显式 `RUN_CALENDAR_PERF=true` 的 CalendarPerformanceIT，本次未启用；没有修改测试或门禁。
- 没有后端/Schema/API 修改；未使用真实账号验证登录及受保护业务页面。本次仅执行已授权的本地 Git 提交，不推送，不修改 Linear 状态；已有 README OPC 段落及 docs/opc-workflow.md 保留在提交之外。

## 本地重启

在 apocalypse-web 目录使用既有 pnpm：

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm preview --host 127.0.0.1 --port 4173 --strictPort
```

另一终端启动独立验收页：

```sh
pnpm exec vite build --config vite.brand-qa.config.ts
pnpm exec vite preview --config vite.brand-qa.config.ts --host 127.0.0.1 --port 4174 --strictPort
```

DEV 总开关检查需要 `pnpm dev --host 127.0.0.1 --strictPort`。三个服务均只监听本机。

## 回滚与人工判断

旧品牌保留为历史资料；如拒绝当前方向，单独撤回本任务的入口、WebGPU 目录、新海报、依赖锁与相应文档/门禁即可。不要覆盖开始时已有的 README OPC 段落和 docs/opc-workflow.md。

非阻塞差异：实时渲染不逐像素复制目标微纹理/气泡分布；海报与实时透射的亮度略有不同。用户已接受当前第一版；本次仅整理本地验收提交，不变更 Linear 状态，也不执行推送。
