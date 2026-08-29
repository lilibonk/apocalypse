# Apocalypse

Java 25 + Spring Boot 4.1 模块化单体通用脚手架。单 Maven 模块 + Spring Modulith 边界强制 + ArchUnit 分层守护，
内置安全认证、两级缓存、MyBatis-Plus、API 文档与完整质量门禁。

## 特性

- **模块化单体**：包即模块（`common`/`framework`/`system`/`order`），Modulith `verify()` 测试期强制边界，跨模块只走 facade 与共享事件契约
- **安全**：Spring Security 7 + OAuth2 Resource Server（JWT/HS256）、RBAC + `sys_menu` 统一权限树（目录/菜单/按钮）、登录失败锁定 + `@RateLimit` 限流 + 强密码策略 + 登录日志审计四件套、在线用户注册表 + jti 黑名单强退、`/auth/token` 服务账号通道（2 期 Agent 接入预留）
- **数据**：PostgreSQL 17 + MyBatis-Plus 3.5.17（分页/防全表删改/乐观锁/审计填充/逻辑删除）+ Flyway 迁移
- **缓存**：自研两级缓存（Caffeine L1 + Redis L2），Redis Pub/Sub 失效广播、空值缓存防穿透、互斥重建防击穿、TTL 抖动防雪崩；Redisson 分布式锁/限流就绪
- **系统管理**：用户/角色/菜单 RBAC、部门树（PG 递归 CTE，无 ancestors 冗余列）、字典与参数配置（缓存）、登录/操作日志（事件驱动落库 + 参数脱敏）、在线用户与强退
- **规范**：统一 `R<T>` 响应（自动包装）、全局异常、TraceId 全链贯通、springdoc OpenAPI 3.1
- **门禁**：Enforcer（版本锁定+禁 Hutool）+ Spotless + Checkstyle + ArchUnit + Modulith verify，全部绑定 `mvn verify`
- **测试**：Testcontainers（PostgreSQL/Redis 容器）全上下文集成测试

## 快速开始

前置：JDK 25（Temurin 绿色版即可）、Docker 运行中。无需安装 Maven（项目内置 Wrapper）。

```bash
# Windows Git Bash：指定 JDK（按实际路径调整；IDEA 用户在 Project SDK 选择即可）
export JAVA_HOME='/d/IDE/JDK/jdk-25.0.4.1+1'

docker compose up -d        # 启动 PostgreSQL 17 + Redis 7
./mvnw spring-boot:run      # 启动应用（默认 dev profile）
```

- Swagger UI：http://localhost:8080/swagger-ui.html
- 登录：`POST /auth/login` `{"username":"admin","password":"admin123"}` → 拿 token，后续请求带 `Authorization: Bearer <token>`
- 当前用户：`GET /system/users/me`（用户信息 + roles + perms + 菜单树）

## 常用命令

```bash
./mvnw compile         # 编译
./mvnw test            # 全部测试（需 Docker，Testcontainers 自动起容器）
./mvnw verify          # 全量门禁（提交前必跑）
./mvnw spotless:apply  # 格式化修复
```

## 环境配置

`application.yml`（公共）+ `application-dev.yml`（本地，默认激活）+ `application-test.yml`（部署测试环境）+ `application-prod.yml`（生产：纯环境变量、关闭 swagger、actuator 仅 health）。切换：`SPRING_PROFILES_ACTIVE=prod`。

生产必须提供的环境变量：`DB_URL`/`DB_USERNAME`/`DB_PASSWORD`、`REDIS_HOST`/`REDIS_PORT`、`JWT_SECRET`（≥32 字节）。
HS256 为脚手架默认值，生产建议切 RS256（替换 `SecurityConfig` 中的 encoder/decoder 为 RSA 密钥对即可）。

## 项目结构

```
io.apocalypse
├── common/       # 共享内核：response(R/ErrorCode/PageResult)、exception、entity(BaseEntity)、
│                 #   annotation(@AgentExposed)、event(跨模块事件契约)
├── framework/    # 技术装配：security(JWT/登录锁定/在线注册/黑名单) / cache(两级) / redis
│                 #   mybatis / openapi / web / log(@OperLog) / ratelimit(@RateLimit) / config
├── system/       # 系统管理域（扁平三层）：用户/角色/菜单/部门/字典/参数/日志/在线用户
└── order/        # 订单域（DDD 分层范本：api/application/domain/infrastructure/interfaces）
```

开发约定与架构红线（十条，均有自动化执法者）见 [AGENTS.md](AGENTS.md)；
1 期设计决策与实施记录见 [docs/plans/phase-1-scaffold.md](docs/plans/phase-1-scaffold.md)。

## 注意事项

- **接入已有数据库**：`spring.flyway.baseline-on-migrate=true` 时，若库非空但无 `flyway_schema_history`（如 Modulith 先建了 `event_publication`），Flyway 会 baseline 跳过 V1。全新库无此问题。
- **缓存 `clear()` 与在线用户列表** 当前用 KEYS 匹配，生产环境请改 SCAN（代码内有注释标注）。
- **登录安全**：连续失败 5 次锁定 10 分钟（Redis 计数）；`/auth/login` 默认限流 20 次/分钟/IP（`apocalypse.ratelimit.limits.login` 可调）；新建/重置密码强制强密码策略（登录不校验——admin 种子弱口令是历史妥协）；强退经 jti 黑名单逐请求拦截。
- **Redis 序列化** 使用带多态类型信息的 JSON 序列化器，仅限内网可信 Redis。
- 2 期规划：`agent-integration` 模块（MCP Server + `@AgentExposed` 白名单工具暴露 + 治理）、A2A（视平台支持）、事件外化 Kafka/AMQP。
