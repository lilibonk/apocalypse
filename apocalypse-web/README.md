# Apocalypse Web

与主仓库同步的 React 19 / Vite 7 / TypeScript 管理台前端。先按[快速开始](../docs/getting-started.md)启动后端服务，再在当前目录执行：

```bash
pnpm install --frozen-lockfile
pnpm dev
```

开发服务器监听 `http://localhost:5173`，并将 `/api` 代理至 `http://localhost:8080`（转发时剥离前缀）。需要指向其他后端实例时，启动前设置 `APOCALYPSE_API_PROXY_TARGET`（该变量不打入浏览器产物）。

## 常用命令

| 命令                | 说明                                  |
| ------------------- | ------------------------------------- |
| `pnpm check`        | 格式检查、lint、Vitest 单测与生产构建 |
| `pnpm test`         | 运行 Vitest 单元测试与设计门禁        |
| `pnpm test:browser` | 运行 Chromium fixtures 交互测试       |
| `pnpm build`        | 执行 TypeScript 编译与 Vite 生产构建  |
| `pnpm format`       | 使用 Prettier 格式化前端源码          |

`src/lib/api/` 封装统一信封与同源刷新令牌重试逻辑；`src/routes/` 根据后端菜单树注册动态路由；`src/components/dyna/` 承载无头控制器 `useDynaController` 与 schema 渲染；`src/i18n/` 自动加载各模块的中英文语言包。新增业务模块页面的约定见[模块开发](../docs/module-development.md)。

Calendar 路由组件随主包构建，但运行时严格依据后端返回菜单和实时授权开放，不在前端设置旁路开关，详情见 [Calendar 手册](../docs/calendar/README.md)。

登录页交互角色基于 `PixelOrb`（WebGPU 实现，在不支持或关闭动效时自动回退至静态图像）。项目自有代码按 [Apache License 2.0](../LICENSE) 授权，第三方源码与依赖声明见[第三方声明](../THIRD_PARTY_NOTICES.md)。

## 界面、主题与页面约定

- **三套原生主题世界**：全站通过 `html[data-theme-world]` 切换 `fluid`（清透流体 · 默认）、`sketchbook`（手绘手账）与 `obsidian`（深邃夜色，自动联动 `.dark` 基线），登录页与顶栏设置共用同一状态，响应两档密度（`compact` / `comfortable`）与中英文切换。所有设计变量、动效边界及组件门禁定义在[设计定义](src/design/DEFINITION.md)和[动效规范](src/design/MOTION.md)。
- **工作台与个人中心**：`/dashboard` 依据当前授权展示近 24 小时／7 天／30 天运行态势、最近审计动态及在线会话；`/profile` 提供独立的个人昵称修改、密码更新（强制全端凭据轮转）与当前登录设备管理。
- **角色授权重构**：`/system/role` 默认呈现实用的角色列表并保留列表 CRUD；点击「授权配置」后在同一路由全宽进入 `RoleWorkbench`，集中处理以下三类关系并统一校验服务端修订号与并发冲突（`40900` 保留草稿并提示重新载入）：
  - **业务权限**：拉取 `GET /system/roles/{id}/permissions` 与权限目录定义，在单表内直接配置启停状态、逐权限部门范围覆盖（受权限定义声明的 `supportedScopeOverrides` 约束）与明确时区的起止有效期；权限标识、生命周期定义由权限目录页（`/system/permission`）集中查阅与启停管理，不能在页面任意创建可执行代码。
  - **导航分配**：通过 `GET/PUT /system/roles/{id}/navigation`（`addIds/removeIds`）维护 C/M 目录及菜单入口，与业务接口授权解耦，不再使用已废弃的 `/roles/{id}/menus`。
  - **角色成员**：基于 `GET /system/roles/{id}/user-ids` 完整基线增删成员。
- **统一的系统管理工作区与分页**：用户管理、权限目录、菜单与部门树表、字典色卡与参数工作区统一收口分页器至全宽下置 `DynaPagination`（含页码、每页条数切换与总条数统计）。其中用户页集中部门树过滤与角色分配/重置密码弹窗闭环；菜单与部门树表支持客户端分页并自动补齐跨页祖先面包屑；字典管理提供 6 种语义色调抽屉（`DictBook`）；参数配置支持跨页保留草稿并按版本并发校验原子保存。
- **授权快照、命令面板与内存草稿**：页面请求与内存草稿（`usePageDraft`）绑定当前登录身份、服务端 `authorizationSnapshotId` 及到期时间，切换账号、撤权或 BFCache 恢复会及时失效旧上下文。全局 `⌘K` 支持规则查询（`?` 前缀，非外部模型），并依据目标菜单与实时权限执行页面跳转或只读降级（`<EntityPeekLink />`）。
- **品牌资源**：应用内顶栏与侧栏签名使用 `BrandSignature`，登录/桌面应用资源位于 `public/brand/`，与仓库根展示区素材（`.github/assets/readme/`）解耦。
