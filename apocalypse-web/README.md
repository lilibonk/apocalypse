# Apocalypse Web

Apocalypse 管理台前端（Vite 7 + React 19 + TypeScript strict + Tailwind v4 + shadcn/ui）。

## 快速开始

```bash
pnpm install
pnpm dev        # http://localhost:5173
```

后端联调：axios `baseURL=/api`，dev server 默认将 `/api` 代理到 `http://localhost:8080` 并 rewrite 剥掉前缀（见 `vite.config.ts`）。需要隔离联调环境时，可在启动前设置服务端专用的 `APOCALYPSE_API_PROXY_TARGET`（例如 `http://127.0.0.1:18080`）；该值不会进入浏览器 bundle。后端不启动时页面可正常渲染，登录会提示网络异常。

## 常用命令

```bash
pnpm build      # tsc -b + vite build
pnpm lint       # oxlint + eslint
pnpm test       # Vitest
pnpm check      # format:check + lint + test + build
pnpm format     # prettier --write .
pnpm exec shadcn add --yes <component>   # 添加 shadcn 组件
```

## 结构速览

- `src/lib/api/` —— 后端契约适配层（axios 实例、R 解包、401/40100 刷新重放、类型）
- `src/stores/` —— auth / settings / tabs（zustand，localStorage 唯一入口）
- `src/routes/` —— 菜单树 → 动态路由、守卫、component 映射（页面组件在 `src/views/**`）
- `src/views/` —— 页面组件与 DynaLayer schema（动态路由 glob 来源）
- `src/components/layout/` —— AppLayout（侧栏/顶栏/页签/cmdk/设置抽屉）
- `src/design/DEFINITION.md` —— 设计定义（视觉唯一事实来源）；`tokens.css` 是它的 CSS 投影
- `src/i18n/` —— react-i18next 初始化、核心 zh/en 词条与构建期模块 locale loader；业务词条共置 `src/views/<module>/i18n/`，zh/en 合同由测试校验
- `src/effects/` —— PixelOrb 兼容入口 / WebGPU 软体史莱姆，以及 PixelWave/PixelScale 通用反馈

约定与红线见 [AGENTS.md](./AGENTS.md)。管理页按“标题 → 上下文工具栏 → 主工作区 → 弹窗/抽屉详情”组织，复用 `FieldSelect` 与 `DatePicker`，不混用浏览器原生日期和选择弹层。Calendar 人工验收修正与回归合同见 [UI 验收](docs/calendar-ui-acceptance.md)。

## 品牌交互

品牌角色已更新为 Three.js WebGPU 青绿半透明史莱姆。登录大尺寸支持揉捏、拎起、回弹与视线跟随，细小透明气泡在体内缓慢上浮。明暗主题自动切换角色材质及海报；鼠标按压无焦点框，键盘焦点仍可见。PixelWave 铅字浪潮不在登录页展示，仅在开发态“界面设置 → 外观实验室 → 动效实验室”通过默认关闭的开关预览。小尺寸、关闭动效或无 WebGPU 环境使用同角色静态海报，不回退 WebGL。验收说明与重现命令见 [品牌验收](docs/brand-slime/acceptance.md)。

## Calendar 模块接入

Calendar 页面和 locale 随构建存在，运行入口只服从后端最新菜单/权限及日历范围角色，没有前端第二开关或运行时远程模块。禁用/撤权后 Calendar query、路由和页签收敛；缺少 component 显示未安装/版本不匹配，不加载任意远程脚本。

六字段人工覆盖、私人/托管日程和年度日别导入的使用边界、配置、API、错误与验收证据统一见 [Calendar 手册](../docs/calendar/README.md)。CSV 只导入日期政策，不是事件导入器。当前浏览器验收见 [交付证据索引](../docs/calendar/evidence-index.md)。
