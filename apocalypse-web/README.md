# Apocalypse Web

Apocalypse 管理台前端（Vite 7 + React 19 + TypeScript strict + Tailwind v4 + shadcn/ui）。

## 快速开始

```bash
pnpm install
pnpm dev        # http://localhost:5173
```

后端联调：axios `baseURL=/api`，dev server 将 `/api` 代理到 `http://localhost:8080` 并 rewrite 剥掉前缀（见 `vite.config.ts`）。后端不启动时页面可正常渲染，登录会提示网络异常。

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
- `src/i18n/` —— react-i18next 初始化与 zh/en 词条（菜单名 key 兜底原文）
- `src/effects/` —— PixelOrb 吉祥物与 PixelWave/PixelScale 品牌动效

约定与红线见 [AGENTS.md](./AGENTS.md)。
