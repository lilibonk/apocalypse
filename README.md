# Apocalypse

Apocalypse 是 Java 25 / Spring Boot 4.1 模块化单体管理后台脚手架。后端保持**单 Maven 模块**，以 Spring Modulith、ArchUnit 和集成测试守护业务边界；同仓库提供 React 管理台。当前版本为 **0.1.0-rc.1 发行候选**，已完成只读及带用户归属写入的隔离模块接入演练；正式发行状态与支持范围见[发行契约](docs/release.md)。

## 已有能力

- 系统管理：用户、角色及三档部门行级数据范围、菜单/按钮权限、部门、字典、参数、登录/操作审计和在线会话。
- 基础设施：Spring Security/JWT、浏览器内存 access/HttpOnly refresh 与 CSRF、对象授权约定、MyBatis-Plus、Flyway、PostgreSQL、Redis/Caffeine 两级缓存、OpenAPI、限流和 TraceId。
- 质量检查：`./mvnw verify` 运行格式、依赖、架构、单元及 Testcontainers 集成检查；前端用 `pnpm check` 运行格式、类型规则、单元测试与构建，`pnpm test:browser` 验证真实 Chromium 交互与权限竞态。
- 可选能力：Calendar 是默认关闭的试验模块，并非业务系统的通用领域模板。关闭运行入口时，它的代码及初始基线中的 Schema 仍在同一制品中；早期 Order 运行 API 已退役，兼容表与事件桥仍保留。

本框架不提供代码生成器。在线任务调度管理平台、公告、多租户及通用文件服务不属于当前发行范围；业务开发使用现有模块入口、DynaLayer 和明确的权限/查询合同。首版支持范围与后续兼容政策以[发行契约](docs/release.md)为准。

## 本地启动

需要 JDK 25、Docker Compose、Node.js 24 和 pnpm 11.19.0。Maven 使用仓库内的 `./mvnw`；本地 Compose 启动 PostgreSQL 18.6 与 Redis 8.10.1。首次启动须在当前 shell 设置私有 `JWT_SECRET` 和一次性的 `APOCALYPSE_BOOTSTRAP_ADMIN_PASSWORD`，然后启动后端与前端。可直接按[快速开始](docs/getting-started.md)逐步执行；其中包含登录、环境排查和完整检查命令。

首版数据库统一从 `V1__init.sql` 安装，仅支持空库；旧开发库须按[开发库重建](docs/operations.md#开发库重建)清空后重新初始化。首版基线冻结后只追加新迁移。

## 文档入口

- [使用文档索引](docs/README.md)：启动、模块接入、运行、发行边界与 Calendar 可选能力。
- [模块开发](docs/module-development.md)：后端模块入口、权限、迁移及前端页面/查询合同。
- [前端 README](apocalypse-web/README.md)：前端命令、目录与联调方式。

模块接入以现行使用文档、代码中的扩展入口及自动化检查为依据。部署前请阅读[运行与升级边界](docs/operations.md)，并按自己的环境验证安全、备份及观测配置。

## 许可

Apocalypse 项目自有部分采用 [Apache License 2.0](LICENSE)；直接移植的代码、素材和依赖仍适用各自原始授权，来源与随附文本见[第三方声明](THIRD_PARTY_NOTICES.md)。公开源代码授权不等于已发布稳定版本；发行、升级与制品级通知的剩余验收见[发行契约](docs/release.md)。
