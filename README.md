# Apocalypse

Java 25 + Spring Boot 4.1 模块化单体通用脚手架。单 Maven 模块 + Spring Modulith 边界强制 + ArchUnit 分层守护，
内置安全认证、两级缓存、MyBatis-Plus、API 文档与完整质量门禁。

## 特性

- **模块化单体**：包即模块（`common`/`framework`/`system`/`order`/`calendar`），Modulith `verify()` 测试期强制边界，跨模块只走 facade 与共享事件契约
- **可选万年历**：默认关闭的 Calendar 模块，支持农历/生肖/节气、版本化法定日别、业务/个人字段覆盖、单次日程与上游事件投影；运行时零联网
- **安全**：Spring Security 7 + OAuth2 Resource Server（JWT/HS256）、RBAC + 对象级授权、PostgreSQL 事务持久化授权/凭证版本即时撤销、refresh jti 原子旋转、登录失败锁定 + 限流 + 强密码策略 + 审计、在线用户强退
- **数据**：PostgreSQL 18.6 + MyBatis-Plus 3.5.17（分页/防全表删改/乐观锁/审计填充/逻辑删除）+ Flyway 迁移
- **缓存**：Caffeine L1 + Redis L2，Pub/Sub 快速失效 + 代数校验自愈、Redisson 跨实例互斥重建、SCAN 批量清理、空值缓存与 TTL 抖动
- **系统管理**：用户/角色/菜单 RBAC、部门树（PG 递归 CTE，无 ancestors 冗余列）、字典与参数配置（缓存）、登录/操作日志（事件驱动落库 + 参数脱敏）、在线用户与强退
- **规范**：统一 `R<T>` 响应（自动包装）、全局异常、TraceId 全链贯通、springdoc OpenAPI 3.1
- **门禁**：Enforcer（版本锁定+禁 Hutool）+ Spotless + Checkstyle + ArchUnit + Modulith verify，全部绑定 `mvn verify`
- **测试**：Testcontainers（PostgreSQL/Redis 容器）全上下文集成测试

## 快速开始

前置：JDK 25（Temurin 绿色版即可）、Docker 运行中。无需安装 Maven（项目内置 Wrapper）。

```bash
# Windows Git Bash：指定 JDK（按实际路径调整；IDEA 用户在 Project SDK 选择即可）
export JAVA_HOME='/d/IDE/JDK/jdk-25.0.4.1+1'

# 每个本地工作会话显式提供独立 JWT 密钥；首次启动另提供一个私有强密码启用 admin
export JWT_SECRET="$(openssl rand -hex 32)"
read -s -p '首次 admin 密码: ' APOCALYPSE_BOOTSTRAP_ADMIN_PASSWORD
export APOCALYPSE_BOOTSTRAP_ADMIN_PASSWORD

# 可选：启用 Calendar（默认 false，修改后需重启全部实例）
export APOCALYPSE_CAPABILITIES_CALENDAR_ENABLED=true

docker compose up -d        # 启动 PostgreSQL 18.6 + Redis 8.10.1
./mvnw spring-boot:run      # 启动应用（默认 dev profile）
```

首次启动成功后执行 `unset APOCALYPSE_BOOTSTRAP_ADMIN_PASSWORD`；后续启动不会重置已启用管理员密码。若已有数据库中的
`admin` 已人工改密，V7 迁移与 bootstrap 初始化器均不会覆盖它。

- Swagger UI：http://localhost:8080/swagger-ui.html
- 登录：`POST /auth/login` 使用 `admin` 与首次设置的私有密码，后续请求带 `Authorization: Bearer <token>`
- 注销：携带 access token 调 `POST /auth/logout`，持久化撤销该用户全部 access/refresh token
- 当前用户：`GET /system/users/me`（用户信息 + roles + perms + 菜单树）

## 常用命令

```bash
./mvnw compile         # 编译
./mvnw test            # 单元与架构测试（不运行 *IT）
./mvnw verify          # 全量门禁（含 Testcontainers 集成测试，提交前必跑）
./mvnw spotless:apply  # 格式化修复
```

## 环境配置

`application.yml`（公共）+ `application-dev.yml`（本地，默认激活）+ `application-test.yml`（部署测试环境）+ `application-prod.yml`（生产：纯环境变量、关闭 swagger、actuator 仅 health）。切换：`SPRING_PROFILES_ACTIVE=prod`。

所有可部署 profile 都必须显式提供 `JWT_SECRET`（≥32 字节）；生产还必须提供
`DB_URL`/`DB_USERNAME`/`DB_PASSWORD`、`REDIS_HOST`/`REDIS_PORT`。
HS256 为脚手架默认值，生产建议切 RS256（替换 `SecurityConfig` 中的 encoder/decoder 为 RSA 密钥对即可）。

## 项目结构

```
io.apocalypse
├── common/       # 共享内核：response(R/ErrorCode/PageResult)、exception、entity(BaseEntity)、
│                 #   annotation(@AgentExposed)、event(跨模块事件契约)
├── framework/    # 技术装配：security(JWT/登录锁定/在线注册/黑名单) / cache(两级) / redis
│                 #   mybatis / openapi / web / log(@OperLog) / ratelimit(@RateLimit) / config
├── system/       # 系统管理域（扁平三层）：用户/角色/菜单/部门/字典/参数/日志/在线用户
├── order/        # 订单域（DDD 分层范本：api/application/domain/infrastructure/interfaces）
└── calendar/     # 可选万年历域（api/application/domain/infrastructure/interfaces）
```

开发约定与架构红线（十条，均有自动化执法者）见 [AGENTS.md](AGENTS.md)；
1 期设计决策与实施记录见 [docs/plans/phase-1-scaffold.md](docs/plans/phase-1-scaffold.md)。

## 注意事项

- **接入已有数据库**：默认 `baseline-on-migrate=false`，Flyway 是唯一 DDL 所有者。已有库必须先备份、人工核对其实际 schema 版本，再显式执行一次 `flyway:baseline`；禁止用全局自动 baseline 跳过未知迁移。
- **macOS/Colima 测试**：若 Docker socket 不在 `/var/run/docker.sock`，为 `./mvnw verify` 设置实际 `DOCKER_HOST`，并设置 `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock`。
- **审计保留**：已完成的 Modulith 事件默认保留 7 天，登录/操作审计默认保留 180 天，可通过 `apocalypse.events` / `apocalypse.audit` 调整。
- **登录安全**：连续失败 5 次锁定 10 分钟（Redis 计数）；`/auth/login` 默认限流 20 次/分钟/IP（`apocalypse.ratelimit.limits.login` 可调）；新建/重置与首次 bootstrap 密码均执行强密码策略；强退经 jti 黑名单逐请求拦截，主动注销经 PostgreSQL 凭证代次撤销全部会话。
- **Redis 序列化** 使用显式类型 ID 的 JSON 信封，仅允许在线用户视图、固定的 system response DTO、缓存使用的 List 与空值哨兵；未知类型在实例化前拒绝。结构版本为 `apoc:v2`，旧缓存自然过期。
- **本地数据服务**：Compose 端口只绑定 `127.0.0.1`，用于当前设备开发，不向局域网接口发布。
- **Calendar 启停**：唯一开关为 `APOCALYPSE_CAPABILITIES_CALENDAR_ENABLED`，缺省为 `false`。关闭时 Calendar HTTP、菜单、权限、facade 与任务一致 fail-closed，但 V8–V10 Schema、历史数据和角色关系保留；禁止通过回退 Flyway 停用模块。
- **Calendar 离线数据**：业务进程不抓取国务院网页，当前年度日别使用随制品发布的已审核 bundle；管理工作台支持 UTF-8 CSV 的 upload → validate → diff → review → publish，并保存原始文件、hash 与发布引用。入口不接收原生 XLSX/XLS/ODS；无法证明官方来源的文件只能成为托管日历 `LOCAL_POLICY`，不得标成 SYSTEM 官方基线。上传默认限制为 6 次/分钟/IP；持久化配额默认为全局 20 GiB、单上传者 2 GiB、单目标 10 GiB，每条导入额外计 1 MiB 固定预留。三个配额可通过 `APOCALYPSE_CALENDAR_IMPORT_STORAGE_*_BYTES` 调整。
- **Calendar 交付手册**：[能力与快速验证](docs/calendar/README.md)、[配置/前端接入](docs/calendar/configuration.md)、[API/权限/重试](docs/calendar/api.md)、[离线年度更新与六字段纠错](docs/calendar/data-update-sop.md)、[保留/清理与回滚方案](docs/calendar/operations-and-retention.md)、[验收证据索引](docs/calendar/evidence-index.md)。当前 500 条同步投影按后台批处理临时接受本机 p95 ≤ 5 秒，千/万级或并发需求另行评估；不是生产 SLA。文档和本地绿测不表示已发布/部署。
- 2 期规划：`agent-integration` 模块（MCP Server + `@AgentExposed` 白名单工具暴露 + 治理）、A2A（视平台支持）、事件外化 Kafka/AMQP。
