# 变更记录

## 0.1.0（2026-11-20）

在 `0.1.0-rc.2` 基础上完成首版发行收口加固、前后端契约对齐与页面排版打磨，前后端版本统一为 `0.1.0` 正式版。

- **通用文件管理与全仓授权门禁**：新增 `V1_1__sys_file_storage.sql` 落地 `sys_file` 台账与权限/导航定义，补齐 `FileContentVerifier`（字节魔数、严格 UTF-8、HTML/SVG/Script 活跃标记拦截与严格 JSON 核验，移除高危通配类型）、PostgreSQL 事务级并发配额锁（单人 64 MiB / 全站 512 MiB）、上传限流与 `attachment` 安全下载头，以及前端 `/system/file` 工作区与右侧滑出元数据检查器；`AuthorizationRulesTest` 全量覆盖业务端点 `@PreAuthorize` 门禁，参考部署改为挂载独立持久 `storage/` 卷而非容器 `tmpfs`。
- **单实例 SSE 实时通道与后端运行加固**：为 `/system/realtime/stream` 增加 25 秒 `:keepalive` 心跳、连接上限、过期令牌驱逐、注销/撤销即时断流与 Nginx `proxy_buffering off` 无缓冲转发；基于 Redisson `4.7.0` 落地限流键 `keepAliveTime` 空闲淘汰与 1-RTT 原子 Lua 准入；将登录/操作与授权审计清理收敛为 `AuditRetention` 单连接会话级 advisory lock 配合每批 5,000 行自动提交；将用户 CSV 批量导入高耗时 BCrypt 移出共享写锁并改由数据库部分唯一索引判重。
- **用户编辑显式清空契约、反代信任收窄与统计缓存**：`PUT /system/users/{id}` 经定制 Jackson 3 适配器 `UserUpdateReqJson` 明确区分“JSON 省略保留”与“显式 `null` 清空”（`deptId` 清空仅限 `ALL` 范围，由非空清空时同步递增账号授权版本失效旧令牌），前端 `UserForm.tsx` 同步对齐；应用默认 `server.forward-headers-strategy: NONE` 且仅在隔离 Compose 内网信任固定 Nginx `/32` 地址；`LogInsightService#operInsights` 的周/月窗口接入 60 秒缓存（`DAY` 实时）。
- **管理台 UX 与排版完善**：统一表格复制到剪贴板容错及读屏播报、半选与 `Shift+Click` 范围连选、点击切换 IME 安全跳转分页、待查询状态圆点、页签中键草稿守卫关闭、平台自适应快捷键提示、只读实时状态指示、强密码规则对齐，并修复字典管理列表切换页头错位与文件管理页边距、配额条及分页对齐。

发布包、源码 tag 与 SHA-256 校验值见 [GitHub Release](https://github.com/lilibonk/apocalypse/releases/tag/v0.1.0)。支持范围、安装恢复及迁移约束见[发行与兼容契约](docs/release.md)。

## 0.1.0-rc.2（2026-11-18，预发布）

在 `0.1.0-rc.1` 基础上完成后端基线巩固与 V2 管理台架构及交互体验全面重构，前后端版本保持同步。

- **后端基线巩固与运行增强**：收敛 Flyway 开发期脚本为单一基线 `V1__init.sql` 并强制 `V1.x` 平台 / `V100.x+` 业务脚本区间隔离；完善请求级 `AuthorizationSnapshot` 复用、单会话 JTI 撤销与用户级凭据失效区分、按用户名+客户端 IP 维度登录锁定、两级缓存单键淘汰与模块化 `RedisCacheTypeRegistration`。新增 `/system/users/me/*` 自助资料/密码/会话接口、声明式安全 CSV 导出、本地文件存储端口以及 `create-module.mjs` / `rebrand-scaffold.mjs` 脚本。
- **V2 空间设计与三大原生主题世界**：确立 `DEFINITION.md` / `MOTION.md` 设计规范，围绕无头 `useDynaController` 与统一因果动效（`unifiedMotion`）重构 DynaLayer 及领域视图；收敛为三套正交主题世界（`fluid` / `sketchbook` / `obsidian`），提供独立 `/profile` 页面、`EntityPeekSheet` 就地预览以及前后端多维筛选与字典 6 色语义色卡。
- **角色管理重构与系统工作区统一**：彻底移除拥挤的四栏拓扑图谱，重建 `/system/role` 统一列表（`授权配置` 入口）与全宽 `RoleWorkbench`（内联业务权限/数据范围矩阵、层级导航树表、角色成员页签及并发与跨部门基线保护）；统一用户、参数与权限目录单视图，为菜单与部门树表增加客户端分页及跨页祖先面包屑，并将字典管理与参数设置分页统一收口至支持每页条数切换与无障碍 `<nav>` 地标的 `DynaPagination`。

本次按发行候选预发布分发，稳定版本尚未发布；具体发布说明与源码归档见 [GitHub 预发布](https://github.com/lilibonk/apocalypse/releases/tag/v0.1.0-rc.2)。支持范围与兼容约束见[发行与兼容契约](docs/release.md)。

## 0.1.0-rc.1（2026-10-01，预发布）

首个通用脚手架发行候选统一前后端版本，保留 Java 25 / Spring Boot 4.1 单 Maven 模块的模块化单体结构。

- 基础能力包含系统用户、角色、菜单、部门、字典、参数、审计日志和在线用户，以及认证撤销、两级缓存、限流和自动化架构检查。
- 管理台使用统一的 Apple 风格设计语言、共享 CRUD 状态和响应式布局。
- README 和管理台工作台使用统一的 Apo 品牌首图；登录、侧栏、移动导航与 favicon 共用图形标，保留原有 WebGPU 形象及交互。
- 部门权限覆盖用户列表、详情、修改和删除；已有角色保持 ALL，新角色默认 DEPT，部门与角色变化参与持久化授权撤销。
- 浏览器 access 仅保留在内存，refresh 使用同源 HttpOnly/Secure Cookie；新增 CSRF 与精确 Origin 校验、多标签页串行刷新和旧凭据清理。非浏览器 JSON 令牌接口保持兼容。
- Tomcat 和 OpenAPI 使用经核验的补丁版本；生产移除 Modulith 文档生成链及重复 Redis 客户端。前端清理未使用依赖，新增类型感知 lint 和 Chromium 浏览器门禁。
- Jackson 两个系列对齐同线安全补丁，Ajv 的 fast-uri 固定到 3.1.8；开发 Swagger UI 的剩余上游问题与使用边界见发行契约。
- 新密码使用兼容旧 bcrypt 的带前缀编码，并限定最多 72 UTF-8 字节；Maven Wrapper 校验发行包摘要，CI Actions 固定完整 commit。
- 提供公开安装、模块开发、运行与发行说明；本地候选工具绑定源码 commit，并核验 JAR、前端资源、部署输入与许可文件的校验值。
- 生产后端关闭默认静态资源映射，避免禁用文档后仍暴露依赖 WebJar；未知路由保持统一的 `40400` 业务码。
- 数据库开发期 V1–V11 收敛为单一初始基线 `V1__init.sql`，直接创建最终约束、索引和种子，管理员默认禁用。首版仅支持空库安装，旧开发库须重建；正式基线冻结后只追加迁移。
- Calendar 默认关闭，按试验能力提供；早期 Order HTTP 已退役，兼容表、隐藏权限种子及事件桥保留。
- 不提供代码生成器；线上任务调度平台、公告、多租户和通用文件服务不包含在本次发行中。部门行级权限的最终范围以[发行契约](docs/release.md)为准。

本次按发行候选分发，稳定版本尚未发布。发布包、源码 tag 和 SHA-256 校验值见 [GitHub 预发布](https://github.com/lilibonk/apocalypse/releases/tag/v0.1.0-rc.1)。开发 Swagger 只处理项目自身的可信 OpenAPI，已知上游问题及捆绑版本证据限制继续保留。本文件不承诺尚未验证的跨版本升级或其他平台支持；支持组合与数据库回退约束见[发行与兼容契约](docs/release.md)。
