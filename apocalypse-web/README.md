# Apocalypse Web

同仓库的 React 19 / Vite 7 / TypeScript 管理台。先按[仓库快速开始](../docs/getting-started.md)启动后端，再从本目录运行：

```bash
pnpm install --frozen-lockfile
pnpm dev
```

开发服务器位于 `http://localhost:5173`，把 `/api` 代理至 `http://localhost:8080` 并去掉前缀。仅需更换开发后端时，可在启动前设置 `APOCALYPSE_API_PROXY_TARGET`；它不会进入浏览器 bundle。登录由后端认证，后端未启动时登录会提示网络错误。

## 开发与检查

| 命令          | 用途                                 |
| ------------- | ------------------------------------ |
| `pnpm check`  | 格式、lint、测试和生产构建的完整检查 |
| `pnpm test`   | Vitest                               |
| `pnpm build`  | TypeScript 与 Vite 构建              |
| `pnpm format` | 格式化本目录文件                     |

`src/lib/api/` 是后端响应和刷新令牌的适配层；`src/routes/` 将后端菜单映射到 `src/views/**` 页面；`src/components/dyna/` 提供标准 CRUD schema 渲染；`src/i18n/` 自动装载模块自己的中英文 locale pack。新业务域的接入步骤见[模块开发](../docs/module-development.md)，代码约束见[前端 AGENTS.md](AGENTS.md)。

Calendar 页面随前端构建存在，但运行时只依据后端最新菜单/权限开放；前端不设置第二个启停开关。其边界和配置见[Calendar 手册](../docs/calendar/README.md)。

登录页的 WebGPU 史莱姆是当前品牌实现；不支持 WebGPU 或用户关闭动效时使用静态展示。第三方来源与授权见[随附 MIT 许可](public/licenses/softie-webgpu.txt)和仓库[第三方声明](../THIRD_PARTY_NOTICES.md)。历史设计验收记录不是新业务页面的接入指南；现行视觉与交互约束见[设计定义](src/design/DEFINITION.md)。
