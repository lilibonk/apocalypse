# 运行与升级边界

当前仓库处于 `0.1.0-rc.1` 候选阶段，尚未发布稳定 tag 或下游升级承诺。本页说明现有代码的运行事实，不能替代实际环境的部署验收。

首次可交付版本的制品、兼容和验收条件见[发行与兼容契约](release.md)。

## 环境与配置

| 环境          | 数据源和密钥                                                                                                          | 文档与健康端点                                          |
| ------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `dev`（默认） | 本地 Compose 的 PostgreSQL/Redis；必须设置 `JWT_SECRET`                                                               | Swagger UI 可用；Actuator 暴露 health、prometheus       |
| `test`        | 由部署测试环境提供连接；集成测试另用 Testcontainers                                                                   | 以实际配置核对                                          |
| `prod`        | 必须设置 `DB_URL`、`DB_USERNAME`、`DB_PASSWORD`、`REDIS_HOST`、`REDIS_PORT`、`JWT_SECRET`、精确 HTTPS `PUBLIC_ORIGIN` | 关闭 OpenAPI 和默认静态资源映射；Actuator 仅暴露 health |

生产环境的数据库、Redis、TLS、备份、凭证、告警和反向代理由部署方配置并验证。默认 JWT 使用 HS256，`issuer=apocalypse`、`audience=apocalypse-api`；下游部署前须审阅命名与密钥管理。当前并不存在通过一个配置项切换 RS256 的能力。

[单机参考部署](deployment.md)给出独立于开发 Compose 的凭据注入、HTTPS 代理和新卷恢复步骤，并明确当前演练覆盖范围。

生产后端只提供 API，前端 `dist` 由独立静态服务提供。`spring.web.resources.add-mappings=false` 同时关闭依赖 WebJar 的默认映射；未知路由仍返回统一 `R.code=40400`。如需由后端提供静态资源，应单独审查资源范围和访问规则。此配置不删除依赖包，也不替代依赖安全修补。

## 数据库与升级

Flyway 是唯一 DDL 所有者，启动时执行 `db/migration`，`baseline-on-migrate=false`。首版只有 `V1__init.sql`，只支持空库安装；开发期 V1–V11 的已有库必须重建，不提供原地升级。首次发行基线冻结后只追加 V2 起的迁移，已应用发行脚本不可修改。已有非 Flyway 业务库的接入属于单独迁移工作，须核对实际结构和数据，不能用自动 baseline 或 repair 掩盖差异。

默认关闭的 Calendar **仍随同一制品发布代码与初始基线中的 Schema**；关闭只收起 HTTP、菜单、权限、facade 运行入口及任务，不删除 Schema、已有数据或角色关系。早期 Order HTTP 已退役，但 `order_info` 兼容表、隐藏权限种子和事件桥仍在。详见[Calendar 手册](calendar/README.md)。

初始基线中的内置管理员角色为 `ALL`，新角色默认 `DEPT`。用户列表、详情、写入及部门选项由服务端按操作权限与部门范围判定，不能依赖前端隐藏控件。修改角色授权、用户角色或部门树会使受影响会话失效，须重新获取身份。

### 开发库重建

旧开发环境切换到首版基线前，先停止连接数据库和 Redis 的本地后端，再从仓库根执行：

```bash
docker compose down --volumes
docker compose up -d --wait
```

此操作永久删除该开发 Compose 项目的 PostgreSQL 和 Redis 数据。只用于可丢弃的开发环境；需要保留的数据应先另行导出，不得对生产库套用。然后按[快速开始](getting-started.md)设置新的私有 JWT 密钥和一次性管理员密码并启动后端；Flyway 会从空库应用一条 V1。成功后移除一次性密码，重启不会重复种子或重置已启用管理员。

浏览器凭据改为内存 access 与同源 HttpOnly/Secure Cookie refresh；升级时清除旧 localStorage 凭据并重新登录。浏览器 POST 要求精确 Origin、CSRF Cookie 与请求头。不支持 Web Locks 的浏览器不自动刷新，过期后重新登录；旧机器客户端 JSON 接口保持兼容。新建及重置密码最多 72 UTF-8 字节，使用带 `{bcrypt}` 前缀的哈希；合法旧 bcrypt 哈希仍可验证。

每次升级至少核对：依赖与环境变量差异、Flyway 新脚本、备份/恢复方案、后端 `verify`、前端 `pnpm check` 与真实浏览器门禁、可选能力启停及权限变化。涉及 Calendar 写入协议的版本不能未经验证混跑；代码回滚不等于数据库迁移回滚。当前仓库没有经消费方验证的跨版本升级演练，不能承诺任意版本原地升级。

## 运维事实

- 审计与已完成事件由定期任务按配置清理；默认已完成事件保留 7 天，登录/操作审计保留 180 天。部署方需审阅保留周期与备份策略。
- 三类审计事件采用有界恢复，达到预算的失败记录保留并等待人工处理；不会随已完成事件清理。重试、积压指标和逐条处置步骤见[审计事件恢复](audit-recovery.md)。
- HTTP 业务结果指标 `apocalypse_http_business_requests_total` 可区分 HTTP 200 内的业务失败；生产默认不暴露 Prometheus 抓取端点。采集、告警与真实部署演练尚未由仓库证明。
- 本地 Compose 只用于开发，不是生产部署清单。生产数据库/Redis 连接和数据卷不得沿用本地默认口令。
