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

## 3. 样式红线：token-only

视觉改动必须对照 `src/design/DEFINITION.md`（设计定义，唯一事实来源）。`tokens.css` 是该文件的 CSS 投影。对不上定义的视觉 PR 先改定义再改代码。

- 组件内**禁止写死颜色与间距像素值**（hex/rgb/oklch 字面量、`px-3.5` 之外的随意值、`style={{color:...}}`），一律走 `src/design/tokens.css` 的 CSS 变量或 Tailwind 语义类（`bg-background` `text-muted-foreground` `border-border` `bg-primary` …）。
- 品牌色单点：只许通过 `--brand`（映射到 `primary`/`ring`）表达；accent 预设组定义在 tokens.css，新增预设只加 `[data-accent]` 组。
- 正式产品品牌主色固定为 `mint`；accent 预设只作为开发态“外观实验室”能力，不得对批准的 Mint Bonk 角色稿运行时换色。正式品牌签名与 PixelOrb 吉祥物严格分离，侧栏、页首与 favicon 使用静态签名，不把吉祥物当 logo。
- 品牌表面（登录舞台、空态、PageLoading、像素进度）尺寸与位移必须落在 4px 整数格上，见 DEFINITION §1；`PixelOrb` 必须直接裁切 `public/brand/mint-bonk-design-sprites-v1.png` 批准状态母版，不得用 Canvas / SVG / CSS / 代码栅格重绘近似角色。只允许显示为 256/128/64/32 四档，非法值开发环境 throw。
- 暗色是一等公民：任何视觉改动必须同时验证 `.dark`；新增颜色变量必须明暗双写。
- 密度走 `--spacing` 缩放（`[data-density]`），禁止为密度单独写覆盖样式。

## 4. 标准页面 DynaLayer 优先（已落地，schema 先行）

- 标准 CRUD/表单/详情页**优先走 `src/components/dyna/` 的 DynaLayer schema 渲染器**；写新页面前先判断能否用 schema 描述，能则不手写页面组件。
- schema 先行约定：页面结构（搜索区/表格列/表单字段/操作）以 schema 为事实来源，手写页面仅保留给越出标准模式的场景。
- `src/views/system/user/index.tsx` 是 DynaLayer golden sample；树形、组合页等越出标准模式的页面必须在文件头说明逃逸原因。

## 5. 动效治理

像素语言边界、表面清单、吉祥物源资产与验收见 `src/design/DEFINITION.md`。本节管引擎与红线；视觉「像不像」以定义为准。

### 引擎分域（允许多库，一库一域，越域即违规）

| 引擎                                    | 域（唯一允许范围）                                                                          | 现状                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------- |
| CSS/Tailwind 过渡                       | 纯 CSS 可表达的微过渡（hover、显隐、颜色、位移）                                            | 内置，**优先于一切 JS 引擎** |
| motion                                  | 通用 UI 动效：组件微交互、页面过渡、布局动画、弹簧                                          | 已装，JS 动效默认选择        |
| GSAP                                    | 复杂时间轴 / 多步编排 / 滚动驱动 / SVG 路径动画；仅限品牌页（登录、关于）与 `effects/gsap/` | 预留域，引入按 §10 报备      |
| WebGL 引擎（three.js / pixi，选型另议） | 2 期 Agent 化身与品牌大场面（流体、粒子、3D）                                               | 预留域，未引入               |

- 选最弱可用工具：能 CSS 不 JS，能 motion 不 GSAP，能 GSAP 不 WebGL。
- **明确弃用，禁止再议**：Lottie / Rive（二进制资产，AI 无法按宪法用代码迭代，与「帧即数据」哲学冲突）、anime.js（命令式与 React 声明式不合）、react-spring（与 motion 域重叠）。
- copy-paste 动效组件（react-bits / Magic UI / 8bitcn 等 registry）引入时，内部引擎必须落在已批准域内；自带未批准引擎（如 ogl、GSAP 变体）的组件，换用同库 motion/CSS 变体或弃用。拷入代码视同自研，遵守本文件全部条款，文件头必须标注来源与许可证。
- 执法：ESLint `no-restricted-imports` 按目录拦截（GSAP 仅品牌页与 `effects/gsap/`、WebGL 引擎仅 `effects/webgl/`）；复杂引擎效果集中在 `src/effects/<engine>/`，`views/` 与 `components/` 只允许 CSS + motion。

### 通用治理（所有引擎一致）

- `prefers-reduced-motion: reduce` 必须降级（tokens.css 有全局兜底；JS 侧用 motion 的 `useReducedMotion` 或等价判断）。
- 设置面板「动画」开关（`html[data-motion='off']`）必须全局生效；任何引擎的动效组件都必须同时尊重这两个开关，参考 `components/PageTransition.tsx` 与 `effects/PixelBean/`。
- 产品面向年轻企业团队，动效目标是鲜明、轻快、可感知；“稳重、克制、内敛”不是默认方向。性能仍要求快速：Dialog / AlertDialog / Sheet 统一由 `PixelDialogMotion` 让真实标题、正文与操作区从 100ms / 150ms / 220ms 起穿过固定八段像素波前，最晚约 720ms 完成；禁止独立轨道、端点、全表面实色遮罩或空白等待。数据密集正文不常驻装饰动画。
- 品牌视觉体系双轨（规格事实来源 `docs/pixel-wave-spec.md`）：焦点层 **PixelOrb** 直接使用批准的 3×2 透明 Mint Bonk 状态母版（`src/effects/PixelOrb/`），固定识别特征是长软左触角、短圆右触角、梨豆形薄荷身体、白色腹斑、腮红与短手脚；氛围层 **PixelWave** 只保留默认 `flowlight` 稀疏淡流光与登录 `letterpress` 同底色连续铅字浪潮。CRUD 浮层不挂 PixelWave，也不得另建视觉 DOM；其 `PixelDialogMotion` 属于通用 UI 动效，直接裁切真实内容并同时遵守双动效开关。禁止另起第三套品牌视觉。
- PixelOrb 状态词汇表固定为 `idle / waiting / success / error / sleeping`（loading 语义并入 waiting；`thinking` 为 2 期 Agent 界面预留、当前不实现），全站状态语义共用同一组件。
- **PixelBean / PixelTide / RetroGrid 已弃用**：`src/effects/PixelBean/` 与 `src/effects/registry/RetroGrid/` 仅保留历史兼容，禁止新代码引用。
- 角色素材机制：`public/brand/mint-bonk-design-sprites-v1.png` 是运行时唯一角色事实来源，3×2 等分、每格 512×512；上排依次 `idle / waiting / success`，下排前两格依次 `error / sleeping`，右下背面仅作设定参考。idle 的 `gaze` 只允许移动从原稿裁出的两枚眼部高光，并以原稿黑色裁片覆盖静态高光；不得代码重画眼睛或身体。历史 `skin` 与 store 字段只保留兼容，设置面板不再提供吉祥物换肤入口。
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
