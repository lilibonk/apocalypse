# Apocalypse

Apocalypse 是开发中的 Java 25 / Spring Boot 4.1 模块化单体管理后台脚手架。后端保持**单 Maven 模块**，以 Spring Modulith、ArchUnit 和集成测试守护业务边界；同仓库提供 React 管理台。当前代码可作为开发基础，已通过一次隔离副本的最小模块接入演练；**尚未发布稳定版本，也未完成跨版本升级验收**。

## 已有能力

- 系统管理：用户、角色、菜单/按钮权限、部门、字典、参数、登录/操作审计和在线会话。
- 基础设施：Spring Security/JWT、对象授权约定、MyBatis-Plus、Flyway、PostgreSQL、Redis/Caffeine 两级缓存、OpenAPI、限流和 TraceId。
- 质量检查：`./mvnw verify` 运行格式、依赖、架构、单元及 Testcontainers 集成检查；前端用 `pnpm check` 运行格式、lint、测试与构建。
- 可选能力：Calendar 是默认关闭的试验模块，并非业务系统的通用领域模板。关闭运行入口时，它的代码及 V8–V10 数据库迁移仍在同一制品中；早期 Order 运行 API 已退役，V2 迁移与事件兼容桥仍保留。

## 本地启动

需要 JDK 25、Docker Compose、Node.js 24 和 pnpm 11.19.0。Maven 使用仓库内的 `./mvnw`；本地 Compose 启动 PostgreSQL 18.6 与 Redis 8.10.1。首次启动须在当前 shell 设置私有 `JWT_SECRET` 和一次性的 `APOCALYPSE_BOOTSTRAP_ADMIN_PASSWORD`，然后启动后端与前端。可直接按[快速开始](docs/getting-started.md)逐步执行；其中包含登录、环境排查和完整检查命令。

## 文档入口

- [使用文档索引](docs/README.md)：启动、模块接入、运行、发行边界与 Calendar 可选能力。
- [模块开发](docs/module-development.md)：后端模块入口、权限、迁移及前端页面/查询合同。
- [前端 README](apocalypse-web/README.md)：前端命令、目录与联调方式。
- [架构约束](AGENTS.md)：贡献者必须遵守的项目红线；前端另见[前端约束](apocalypse-web/AGENTS.md)。

维护者的产品计划、历史设计和验收证据不属于使用脚手架的前置条件。仓库内 `docs/plans/` 等历史记录不替代上述现行使用文档。部署前请阅读[运行与升级边界](docs/operations.md)，并按自己的环境验证安全、备份及观测配置。

## 许可

Apocalypse 项目自有部分采用 [Apache License 2.0](LICENSE)；直接移植的代码、素材和依赖仍适用各自原始授权，来源与随附文本见[第三方声明](THIRD_PARTY_NOTICES.md)。公开源代码授权不等于已发布稳定版本；发行、升级与制品级通知的剩余验收见[发行契约](docs/release.md)。
