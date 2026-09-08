# AGENTS.md —— Apocalypse Web 前端宪法

> 本文件是 AI 编码 Agent 在本仓库工作时的根本约束。修改架构、新增红线时，必须同步更新本文件。

## 1. 项目定位

Apocalypse 管理台前端，位于同一仓库的 `apocalypse-web/` 子目录；上层 `AGENTS.md` 同时生效。本阶段按契约编程，axios 实例 `baseURL=/api`，vite dev proxy 将 `/api` 转发 `http://localhost:8080` 并 rewrite 剥掉前缀（后端无 context-path）。

## 2. 技术栈锁定清单（禁止替换核心选型）

- Vite **7** + React **19** + TypeScript（`strict: true`）
- Tailwind CSS **v4**（`@tailwindcss/vite`，CSS-first 配置，无 tailwind.config）
- shadcn/ui（CSS 变量模式，style=new-york，组件源码在 `src/components/ui/`，经 `pnpm exec shadcn add --yes <name>` 添加）
- zustand（状态）+ react-router **v7**（库模式）+ @tanstack/react-query（服务端状态）
- axios（HTTP 客户端，唯一入口 `src/lib/api/client.ts`）+ i18next / react-i18next（zh 默认，en 全量词条：菜单/DynaLayer/布局壳/登录页；原文键 defaultValue 兜底，插值模板用语义键）
- lucide-react（图标）+ cmdk（命令面板）+ motion（npm 包名 `motion`，动效）
- react-hook-form + zod（表单）
- ESLint（flat config）+ Prettier + oxlint（`pnpm lint` 串行跑 oxlint + eslint）
- 包管理一律 **pnpm**，禁止 npm/yarn

### 模块国际化扩展点

- `src/i18n/locales/` 只承载登录、布局壳、DynaLayer 等跨模块核心词条；业务模块词条必须与模块共置于 `src/views/<module>/i18n/`。
- 每个模块导出唯一 namespace 的 locale pack，由 `src/i18n/module-loader.ts` 使用 Vite 构建期 `import.meta.glob` 自动发现；新模块禁止在全局 i18n 入口手写 import/注册。
- zh/en 语言包必须有完全一致的叶子 key；namespace、菜单贡献或 key 冲突必须 fail-fast，并由 Vitest 合同测试执法。
- 模块页面使用 `useTranslation('<module>')`，纯函数使用显式 namespace 的 `getFixedT`。用户/业务原文及后端 `R.message` 原样显示，禁止当作翻译 key。
- 当前 locale pack 随构建产物 eager 内置，运行时不联网。引入 HTTP locale backend、远程词条或运行时安装属于新架构/依赖 Gate，必须重新调研和请示。

## 3. 样式红线：token-only

视觉改动必须对照 `src/design/DEFINITION.md`（设计定义，唯一事实来源）。`tokens.css` 是该文件的 CSS 投影。对不上定义的视觉 PR 先改定义再改代码。

- 组件内**禁止写死颜色与间距像素值**（hex/rgb/oklch 字面量、`px-3.5` 之外的随意值、`style={{color:...}}`），一律走 `src/design/tokens.css` 的 CSS 变量或 Tailwind 语义类（`bg-background` `text-muted-foreground` `border-border` `bg-primary` …）。
- 品牌色单点：只许通过 `--brand`（映射到 `primary`/`ring`）表达；accent 预设组定义在 tokens.css，新增预设只加 `[data-accent]` 组。
- 正式产品品牌主色固定为 `mint`；accent 预设只作为开发态“外观实验室”能力，不得对正式史莱姆运行时换色。正式品牌签名与吉祥物严格分离，侧栏、页首与 favicon 使用静态签名，不把吉祥物当 logo。
- 品牌容器尺寸与布局仍落在 4px 整数格上；LIL-85 经用户于 2026-09-08 授权，将旧 Mint Bonk 像素母版替换为半透明 WebGPU 史莱姆。`PixelOrb` 保留兼容入口，合法尺寸为 384/256/128/64/32，非法值开发环境 throw；3D 表面形变与渲染不做整像素量化。目标与验收见 `docs/brand-slime/solution-fit.md` 和 `src/design/DEFINITION.md`。
- 3D 材质 sRGB 色值仅在 `tokens.css` 的 `--slime-*` token 中定义，运行时读取同源值；数字几何/物理/光照参数集中在 `effects/webgpu/slime/`，不得扩散到业务组件。
- 暗色是一等公民：任何视觉改动必须同时验证 `.dark`；新增颜色变量必须明暗双写。
- 密度走 `--spacing` 缩放（`[data-density]`），禁止为密度单独写覆盖样式。

## 4. 标准页面 DynaLayer 优先（已落地，schema 先行）

- 标准 CRUD/表单/详情页**优先走 `src/components/dyna/` 的 DynaLayer schema 渲染器**；写新页面前先判断能否用 schema 描述，能则不手写页面组件。
- schema 先行约定：页面结构（搜索区/表格列/表单字段/操作）以 schema 为事实来源，手写页面仅保留给越出标准模式的场景。
- `src/views/system/user/index.tsx` 是 DynaLayer golden sample；树形、组合页等越出标准模式的页面必须在文件头说明逃逸原因。

### 全局管理台设计语言（强制）

- 按 `src/design/DEFINITION.md` 的管理工作台层级组织页面：单一标题 → 上下文/操作栏 → 主工作区 → 按需详情；长流程按任务分区，不将编辑、复核、历史等权平铺。
- 普通列表/月历的“查看详情”使用 Dialog 或 Sheet，禁止底部追加详情。短表单/确认用 Dialog，长详情用 Sheet；必须有可访问标题、关闭入口、正文滚动与焦点返回。复核/编辑工作台可用有明确名称、选中上下文的主辅栏，不等同于追加详情。
- 标准下拉复用 `components/ui/field-select.tsx`；日期/月/本地时间复用 `components/ui/date-picker.tsx`，禁止业务页面引入原生 `<select>` 与 date/month/datetime-local 弹层。农历数值编辑不等同公历选择器，不得暗改日期事实。
- 枚举值只用于接口，不作为用户可见标签；在模块 locale 中解释角色、来源、状态和动作。技术标识放追溯区，保留用户原始内容和后端错误消息。
- 初次工作台目录收起，深链展开当前分支；叶菜单精确匹配，禁止父路径前缀导致多个菜单高亮。
- Calendar 执法：`ui-contract.test.tsx`、共享日期模型测试与侧栏测试；浏览器检查按 `docs/calendar-ui-acceptance.md` 执行。新模块沿用此语言，并添加自己的接入/可访问性回归，不以截图或快照单项替代交互验收。

## 5. 动效治理

像素语言边界、表面清单、吉祥物源资产与验收见 `src/design/DEFINITION.md`。本节管引擎与红线；视觉「像不像」以定义为准。

### 引擎分域（允许多库，一库一域，越域即违规）

| 引擎              | 域（唯一允许范围）                                                                          | 现状                         |
| ----------------- | ------------------------------------------------------------------------------------------- | ---------------------------- |
| CSS/Tailwind 过渡 | 纯 CSS 可表达的微过渡（hover、显隐、颜色、位移）                                            | 内置，**优先于一切 JS 引擎** |
| motion            | 通用 UI 动效：组件微交互、页面过渡、布局动画、弹簧                                          | 已装，JS 动效默认选择        |
| GSAP              | 复杂时间轴 / 多步编排 / 滚动驱动 / SVG 路径动画；仅限品牌页（登录、关于）与 `effects/gsap/` | 预留域，引入按 §10 报备      |
| Three.js + WebGPU | 品牌史莱姆，限 `effects/webgpu/`；无 WebGL fallback                                         | LIL-85 已批准，精确版本锁定  |

- 选最弱可用工具：普通 UI 能 CSS 不 JS，能 motion 不 GSAP；已批准史莱姆使用 Three.js WebGPU。禁止为了兼容而改用 WebGL。
- **明确弃用，禁止再议**：Lottie / Rive（二进制资产，AI 无法按宪法用代码迭代，与「帧即数据」哲学冲突）、anime.js（命令式与 React 声明式不合）、react-spring（与 motion 域重叠）。
- copy-paste 动效组件（react-bits / Magic UI / 8bitcn 等 registry）引入时，内部引擎必须落在已批准域内；自带未批准引擎（如 ogl、GSAP 变体）的组件，换用同库 motion/CSS 变体或弃用。拷入代码视同自研，遵守本文件全部条款，文件头必须标注来源与许可证。
- 执法：ESLint `no-restricted-imports` 按目录拦截（GSAP 仅品牌页与 `effects/gsap/`；Three.js 仅 `effects/webgpu/`，禁止 WebGLRenderer/WebGLBackend/裸包入口及 WebGL fallback 子路径）；复杂引擎效果集中在 `src/effects/<engine>/`，`views/` 与 `components/` 只消费封装组件。真实后端与 fail-closed 由品牌契约测试和浏览器检查共同验证。

### 通用治理（所有引擎一致）

- `prefers-reduced-motion: reduce` 必须降级（tokens.css 有全局兜底；JS 侧用 motion 的 `useReducedMotion` 或等价判断）。
- 设置面板「动画」开关（`html[data-motion='off']`）必须全局生效；任何引擎的动效组件都必须同时尊重这两个开关，参考 `components/PageTransition.tsx` 与 `effects/PixelBean/`。
- 产品面向年轻企业团队，动效目标是鲜明、轻快、可感知；“稳重、克制、内敛”不是默认方向。性能仍要求快速：Dialog / AlertDialog / Sheet 统一由 `PixelDialogMotion` 让真实标题、正文与操作区从 100ms / 150ms / 220ms 起穿过固定八段像素波前，最晚约 720ms 完成；禁止独立轨道、端点、全表面实色遮罩或空白等待。数据密集正文不常驻装饰动画。
- 品牌角色唯一为青绿半透明史莱姆（目标 `docs/brand-slime/target-v1.png`）：圆润软体、内部漂浮气泡、两只黑豆眼与小嘴。眼睛可沿皮肤平滑跟随鼠标，脸与身体共享表面形变，不能漂浮分离。2026-09-08 用户最终要求 PixelWave 铅字浪潮仅保留为开发态动效实验室的默认关闭开关，登录禁止挂载；收起实验室/关闭抽屉卸载预览。WebGPU 画布透明合成；既有 PixelScale 与 PixelDialogMotion 保持，不把 3D 引入数据正文。旧 Mint Bonk 资产仅作历史回滚资料，不得进入新运行时。
- 史莱姆明暗主题使用独立、同源的材质 token 与静态海报，自动切换，不依赖 accent/历史皮肤。鼠标按压不得显示键盘焦点框，键盘焦点提示仍须可见。气泡漂浮与视线跟随必须遵守动效开关与隐藏暂停；由品牌回归测试及浏览器证据执法。
- PixelOrb 状态词汇表固定为 `idle / waiting / success / error / sleeping`（loading 语义并入 waiting；`thinking` 为 2 期 Agent 界面预留、当前不实现），全站状态语义共用同一组件。
- **PixelBean / PixelTide / RetroGrid 已弃用**：`src/effects/PixelBean/` 与 `src/effects/registry/RetroGrid/` 仅保留历史兼容，禁止新代码引用。
- 运行时机制：按需加载 WebGPU 引擎；无 API、初始化失败或设备丢失展示新角色静态海报与明确提示，禁止 WebGL 回退。reduced-motion/全局动画关闭以及小尺寸非交互空态使用静态新角色，不申请 GPU；隐藏/离屏暂停、卸载释放设备与资源。历史 `skin` 与 store 字段只保留兼容，设置面板不提供吉祥物换肤入口。
- 颜色例外：像素调色板的颜色字面量只允许出现在 `effects/*/skins/*.ts` 数据文件中；组件其余样式仍 token-only。PixelWave 波纹允许**程序化 oklch 取色**（hue 随波相位旋转形成五彩纹路、明度随明暗主题适配，禁写死 hex 色板）；其余像素光效一律走 `--brand` 明度阶梯。

## 6. 后端契约（适配层在 `src/lib/api/`，页面不直接感知后端细节）

- 统一响应 `R<T> = {code, message, data, traceId, timestamp}`：业务成功 `code === 0`；业务错误 HTTP 200 + 非 0 code；未认证 **40100**（token 失效/黑名单同码）。
- 40100 处理链（`client.ts` 响应拦截器）：HTTP 401 或 R.code=40100 → `tryRefresh`（POST /auth/refresh，旋转换新已联调可用）→ 成功重放原请求一次 → 失败登出跳 `/login`。历史持久化态无 refreshToken 时直接登出重登。
- **装箱 Long id 在 JSON 中是 string**：前端一律 `SnowflakeId = string`，禁止 `Number(id)`。
- 分页 `PageResult<T> = {list, total, page, size}`。
- 错误文案：直接展示后端 `R.message`（中文直出），禁止前端自行翻译/包装。
- perms 命名约定 `域:对象:动作`（如 `system:user:list`）；区块级控制用 `<Perm>`（`@/components/Perm`，`RequirePerm` 为保留别名），hooks 用 `usePerm()`，路由来自后端菜单树（页面组件落 `src/views/**/index.tsx`）。

## 7. 代码红线

- **禁 `any`**（`unknown` + 收窄替代）；TS 必须保持 `strict` 通过。
- **禁直接操作 localStorage**：一律走 zustand store（`persist` 中间件是唯一合法入口）。
- 禁在组件里发裸 `fetch`：一律走 `lib/api/client.ts` 的 `request()`。
- 服务端数据缓存用 react-query；跨组件 UI 状态用 zustand；局部状态用 useState。禁止把服务端数据搬进 zustand。
- **NavLink 的函数式 `className` 禁止与 `asChild`/Slot 组合**（TooltipTrigger 等）：Slot 克隆合并 props 时会把函数字符串化成源码文本注入 class，样式全废。被 Slot 包裹的 NavLink 一律用 `useLocation` 手动算 `isActive` 传静态字符串 className（范例：`components/layout/Sidebar.tsx`）。

### 路由页签与菜单树

- 工作台 `/dashboard` 是固定页签，不渲染关闭按钮，任何批量关闭都必须保留它。
- 关闭当前页签必须同步路由回工作台；关闭非当前页签不得改变当前路由。批量组件统一提供关闭左侧、右侧、其他、全部，并对不可执行项禁用。
- 页签 store 的关闭动作返回目标路由，由组件负责 `navigate`；不得只删状态而让页面停留在已关闭路由。
- 菜单图标只能通过 `MenuIconPicker` 与 `components/layout/menu-icons.ts` 的受控映射选择，禁止自由文本造成图标丢失。
- 父菜单使用 `MenuTreeSelect`：排除当前节点及其子树，支持搜索、展开/折叠、结果上限提示与滚动容器；禁止把膨胀后的整棵树一次性铺成普通 Select。
- 模块 capability 的运行态事实只来自后端最新 `/me` 菜单/权限，不增加前端环境开关或第二份真源。登录、refresh、窗口恢复或 `/me` 变化后，必须取消并移除失效模块的 React Query 缓存、关闭不再授权的页签；当前 URL 失效时 `replace('/dashboard')`。直接 URL、旧缓存或旧页签不得绕过菜单撤回；菜单 component 缺少本地 chunk 时 fail-closed 且不得调用该模块 API。

## 8. 设置面板：能力全集 + 下游可裁剪

- 能力项登记在 `stores/settings.ts` 的 `CAPABILITY_META`，每项带 `exposed` 布尔。
- 本仓库默认暴露全集（演示用）；下游裁剪 = 把对应项 `exposed` 改为 `false`（面板与生效逻辑自动收敛，组件零改动）。
- 新增能力项：加 `CAPABILITY_META` 条目 + store 字段 + 抽屉区块 +（如需）providers 的 DOM 生效层。

## 9. 命令

```bash
pnpm install        # 安装（已含 esbuild build 许可与 shadcn CLI 的 zod 覆盖，见 pnpm-workspace.yaml）
pnpm dev            # 开发（:5173，代理 /api → :8080 并剥前缀）
pnpm build          # tsc -b + vite build（提交前必过）
pnpm lint           # oxlint + eslint（串行）
pnpm test           # Vitest 一次性运行
pnpm check          # format:check + lint + test + build（前端全量门禁）
pnpm format         # prettier --write .（提交前必跑）
```

## 10. 必须请示人类的事项

1. 新增/升级/删除任何依赖（含 shadcn 新组件引入的新 radix 包——`add` 前先说）
2. 修改本文件、后端契约适配层的对外类型（`lib/api/types.ts` 的导出契约）
3. 替换核心选型、关闭 strict、引入第二套状态库/样式方案
4. 任何 `git commit/push` 等版本库写操作
