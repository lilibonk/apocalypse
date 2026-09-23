# 运行与升级边界

当前仓库是开发版，尚未发布稳定 tag、对外支持矩阵或下游升级承诺。本页说明现有代码的运行事实，不能替代实际环境的部署验收。

首次可交付版本的制品、兼容和验收条件见[发行与兼容契约](release.md)。

## 环境与配置

| 环境 | 数据源和密钥 | 文档与健康端点 |
| --- | --- | --- |
| `dev`（默认） | 本地 Compose 的 PostgreSQL/Redis；必须设置 `JWT_SECRET` | Swagger UI 可用；Actuator 暴露 health、prometheus |
| `test` | 由部署测试环境提供连接；集成测试另用 Testcontainers | 以实际配置核对 |
| `prod` | 必须设置 `DB_URL`、`DB_USERNAME`、`DB_PASSWORD`、`REDIS_HOST`、`REDIS_PORT`、`JWT_SECRET` | 关闭 OpenAPI；Actuator 仅暴露 health |

生产环境的数据库、Redis、TLS、备份、凭证、告警和反向代理由部署方配置并验证。默认 JWT 使用 HS256，`issuer=apocalypse`、`audience=apocalypse-api`；下游部署前须审阅命名与密钥管理。当前并不存在通过一个配置项切换 RS256 的能力。

## 数据库与升级

Flyway 是唯一 DDL 所有者，启动时会执行 `db/migration` 的全部迁移，`baseline-on-migrate=false`。空库由 V1 起初始化；接入已有库须先备份并核对真实 schema 版本，再显式执行一次 Flyway baseline，不能把自动 baseline 当作兼容方案。已应用脚本不可修改；失败时先分析迁移状态，不通过回退迁移文件停用模块。

默认关闭的 Calendar **仍随同一制品发布代码与 V8–V10 迁移**；关闭只收起 HTTP、菜单、权限、facade 运行入口及任务，不删除 Schema、已有数据或角色关系。早期 Order HTTP 已退役，但 V2 `order_info` 和事件兼容桥仍在当前迁移/制品中。详见[Calendar 手册](calendar/README.md)。

每次升级至少核对：依赖与环境变量差异、Flyway 新脚本、备份/恢复方案、后端 `verify`、前端 `pnpm check`、可选能力启停及权限变化。涉及 Calendar 写入协议的版本不能未经验证混跑；代码回滚不等于数据库迁移回滚。当前仓库没有经消费方验证的跨版本升级演练，不能承诺任意版本原地升级。

## 运维事实

- 审计与已完成事件由定期任务按配置清理；默认已完成事件保留 7 天，登录/操作审计保留 180 天。部署方需审阅保留周期与备份策略。
- HTTP 业务结果指标 `apocalypse_http_business_requests_total` 可区分 HTTP 200 内的业务失败；生产默认不暴露 Prometheus 抓取端点。采集、告警与真实部署演练尚未由仓库证明。
- 本地 Compose 只用于开发，不是生产部署清单。生产数据库/Redis 连接和数据卷不得沿用本地默认口令。
