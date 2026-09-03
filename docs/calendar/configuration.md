# 配置与模块接入

## 配置事实源

公共配置来自 [application.yml](../../src/main/resources/application.yml)，三个部署 profile 不另设相反的 Calendar 默认值。

| 配置                                                | 环境变量                                            | 默认值 / 生效方式     |
| --------------------------------------------------- | --------------------------------------------------- | --------------------- |
| `spring.profiles.active`                            | `SPRING_PROFILES_ACTIVE`                            | `dev`；启动时选择     |
| `apocalypse.capabilities.calendar.enabled`          | `APOCALYPSE_CAPABILITIES_CALENDAR_ENABLED`          | `false`；重启全部实例 |
| `apocalypse.calendar.import-storage.total-bytes`    | `APOCALYPSE_CALENDAR_IMPORT_STORAGE_TOTAL_BYTES`    | 21474836480（20 GiB） |
| `apocalypse.calendar.import-storage.uploader-bytes` | `APOCALYPSE_CALENDAR_IMPORT_STORAGE_UPLOADER_BYTES` | 2147483648（2 GiB）   |
| `apocalypse.calendar.import-storage.target-bytes`   | `APOCALYPSE_CALENDAR_IMPORT_STORAGE_TARGET_BYTES`   | 10737418240（10 GiB） |

三个累计配额必须为正数；按原始 CSV + 证据文件字节数及每条 1 MiB 预留计费。它们不是数据库物理体积限制，也不替代 WAL/备份/磁盘监控。改变配额须按配置发布流程重启，不能通过手改导入记录绕过。

- `dev`：本机开发；先确认数据库是专用开发库，存在 Flyway checksum 异常时不要直接启动迁移或 repair。
- `test`：部署态测试 profile，需要自己的数据库/Redis/JWT 配置；**不等于自动化集成测试环境**。
- `prod`：DB_URL / DB_USERNAME / DB_PASSWORD / REDIS_HOST / REDIS_PORT / JWT_SECRET 等由部署系统注入；关闭 swagger。不得将密钥写入文档、日志、命令历史或版本库。
- 自动化 `*IT`：Testcontainers 的一次性环境，由测试显式控制 capability；不要用 test profile 连接部署态测试库。

## 启用与一致切换

1. 核对前后端制品版本、配置、可用存储、数据库备份以及 V8–V10 迁移；先在隔离环境通过全量验证。Flyway 是唯一 DDL 所有者。
2. 在开关保持 false 时准备兼容后端与前端制品。前端 Calendar 页面/locale 必须已经随构建存在；后端菜单 component 必须匹配。
3. 设置 `APOCALYPSE_CAPABILITIES_CALENDAR_ENABLED=true`。切换时排空受影响流量或使用受控维护窗口，使重新接流量的实例具有相同开关与兼容制品；不支持在同一负载均衡池长期混用 enabled/disabled。
4. 确认基线/provider/资源 hash 完整性检查通过，再开放入口；按角色分配 Calendar 菜单/按钮权限，同时给具体业务日历分配范围角色。
5. 让已有会话刷新 `/system/users/me` 或重新登录，核对菜单、权限、当前 URL、页签和日期来源；不以旧 JWT/UI 缓存判断已授权。

关闭时将同一个变量设为 false，并用相同流量切换原则重启所有实例。HTTP 不注册（带有效身份访问返回统一 `40400`），facade bean 保留但抛 `11000`；菜单/perms 消失，前端失效路由回工作台并清理 Calendar query/页签。**Schema、业务数据、修订、来源与角色关系全部保留**。重新启用后查询原日程和来源，核对保留结果。

开关不是热更新配置；不在管理台、sys_config 或前端 env 中增加第二份开关。全局日志清理任务不属于 Calendar，它们不会因为 Calendar 关闭而停止，见 [保留策略](operations-and-retention.md)。

## 前端接入与缺页诊断

- 页面位于 `apocalypse-web/src/views/calendar/**/index.tsx`，由既有构建期 glob 发现；后端菜单 component 是入口，不加载远程 JavaScript。
- 词条与模块共置 `src/views/calendar/i18n/`，模块 namespace 为 `calendar`；现有 loader 构建期发现并校验 zh/en 一致性。新模块沿用同一机制，不在全局词条文件逐页登记。
- 浏览器请求 `/api/...`；开发代理剥 `/api` 后到后端默认 8080。仅隔离本机联调可设 `APOCALYPSE_API_PROXY_TARGET=http://127.0.0.1:18080`；生产反向代理也须保持路径合同，不能靠打开 CORS 通配来修复路由错误。
- 缺少页面 chunk/菜单 component 不匹配：显示“页面未安装或版本不匹配”并 fail-closed；先核对前后端构建、component 和缓存部署，不增补任意远程脚本或伪造菜单。
- 全局权限只决定是否允许调用接口；页面内容动作还受当前日历范围角色约束。401/授权版本失效后的刷新由共享 API client 处理；403/版本冲突保留后端 message 并回读最新数据。

本文件描述发布顺序，不构成当前部署授权。
