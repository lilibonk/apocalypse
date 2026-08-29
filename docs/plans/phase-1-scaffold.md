# Apocalypse 脚手架 · 1 期实施计划

> 版本：v1.3  日期：2026-08-24  状态：已完成（含 v1.3 system 域扩充，工作项 15/16 已交付）
> v1.3 变更：经 RuoYi 式"系统管理"批判性分析（§8 决策 6）后扩充 1 期范围——`user` 正名 `system` 系统管理域，
> 补齐部门/字典/参数/日志/在线用户与登录安全四件套；显式舍弃岗位/公告/quartz/代码生成/监控页/Excel/验证码；
> 2 期讨论点新增"消息中心"模块与 i18n 插件化评估。
> v1.2 变更：common 分包；配置切分；RBAC 改 sys_menu 统一权限树；事件契约下沉 common.event。

## 0. 环境约定

- **JDK**：`D:\IDE\JDK\jdk-25.0.4.1+1`（Temurin 25.0.4.1 绿色版，不做系统级安装/修改）。
  命令行构建一律前置 `JAVA_HOME` 指向该目录；IDEA 在 Project SDK 中选择此目录。
- **Maven**：项目内置 **Maven Wrapper（3.9.16）**，版本由项目托管，与机器安装的 Maven 无关。
- **Docker**：已安装；`postgres:18.6-alpine`、`redis:8.10.1-alpine` 镜像已拉取本地（Testcontainers 复用）。

## 1. 目标

交付一个可直接用于生产项目起步的 Java 后端通用脚手架：**单 Maven 模块**（刻意决策，非多模块）、按业务域分包、
Spring Modulith 强制模块边界、ArchUnit 强制模块内分层、**完整的系统管理基座**（RBAC/部门/字典/参数/日志/在线用户）、
内置安全/缓存/ORM/文档/质量门禁，并为 2 期"外部 Agent 接入"预留治理原语与暴露标记。

## 2. 技术基线（均已核实并构建验证）

| 项 | 版本 | 说明 |
|---|---|---|
| JDK | 25.0.4.1 LTS（Temurin） | Enforcer 锁 `[25,26)` |
| Maven | 3.9.16（Wrapper） | Enforcer 锁 `[3.9.0,4.0.0)`（Maven 4 未 GA） |
| Spring Boot | 4.1.1 | Framework 7 / Jakarta EE 11 |
| Spring Modulith | 2.1.0 | 显式 import BOM；JDBC 事件登记表（自动建表） |
| PostgreSQL | 18.6 | Flyway 12.4（BOM）+ **spring-boot-flyway**（Boot 4 拆分，必需） |
| MyBatis-Plus | 3.5.17 | `mybatis-plus-spring-boot4-starter` + **mybatis-plus-jsqlparser**（3.5.9+ 拆分，必需） |
| Redis | 8.10.1 | Spring Data Redis + Redisson 4.7.0（自带 redisson-spring-data-41） |
| Caffeine | 3.2.4（BOM） / springdoc | 3.1.0 |
| MapStruct | 1.6.3 / ArchUnit 1.5.0 / Testcontainers 2.0.5（显式 BOM，`testcontainers-*` 前缀构件） |
| Spotless 3.10.0 / Checkstyle 14.0.0（插件 3.6.0） / Enforcer 3.6.3 / JaCoCo 0.8.15（排除 jsqlparser） | | 绑定 `verify` |

## 3. 工程结构（终态）

```
io.apocalypse
├── ApocalypseApplication
├── common/        # OPEN：response/exception/entity(BaseEntity)/annotation(@AgentExposed)/event(集成事件契约)
├── framework/     # OPEN：security(JWT/RBAC端口/401·403统一入口/登录锁定/token黑名单) / cache(两级) / redis
│                  #       mybatis / openapi / web / log(@OperLog切面) / ratelimit(@RateLimit) / config
├── system/        # 系统管理域：用户/角色/菜单/部门/字典/参数/登录日志/操作日志/在线用户
└── order/         # 核心域 DDD 范本：api(@NamedInterface)/application/domain(纯净)/infrastructure/interfaces
```

环境配置：`application.yml`（公共）+ `application-dev.yml`（本地）+ `application-test.yml`（部署测试）+ `application-prod.yml`（生产，纯环境变量、关 swagger）。集成测试用 Testcontainers，不占 test profile。

## 4. WBS 终态

| # | 工作项 | 结果 |
|---|---|---|
| 1~8 | 骨架、common、framework 基础设施 | ✅ 冒烟验证通过 |
| 9 | user 域（RBAC 三件套） | ✅ 完成（v1.3 并入 system 域继续扩充） |
| 10 | order 域（DDD 形态） | ✅ 跨模块 facade、领域事件、V2 迁移 |
| 11 | 边界与分层测试 | ✅ Modulith verify + ArchUnit 5 条 |
| 12 | 集成测试 | ✅ Testcontainers 13/13 |
| 13 | 质量门禁 | ✅ `mvn verify` 全绿 |
| 14 | 文档 | ✅ AGENTS.md / README / 本文件 |
| 15 | **system 域扩充**（v1.3） | ✅ user→system 正名；部门（PG 递归 CTE，无 ancestors 冗余列）、字典（缓存）、参数配置（缓存）、登录日志+操作日志（事件驱动+参数脱敏）、在线用户（jti 注册表+黑名单强退）、登录失败锁定、@RateLimit 限流、用户/角色补齐（重置密码/角色分配用户）；V3 迁移 + 菜单种子 |
| 16 | system 域集成测试（v1.3） | ✅ 部门树/字典缓存/配置读取/日志落库与脱敏断言/在线用户与强退/登录锁定/限流（独立上下文覆盖） |
| 17 | 两级缓存失效广播修复（v1.3 收尾） | ✅ 修复发布方 JSON 二次编码导致订阅方静默解析失败的存量 bug（改 StringRedisTemplate 纯文本频道），`CacheInvalidationIT` 全链路回归覆盖；测试总数 21 |
| 18 | 模块结构规范化（v1.3 收尾） | ✅ 模块根包只放 package-info；暴露面统一 `<module>/api`（@NamedInterface）；system 按子域分包（user/role/menu/dept/dict/config/log/online）；dto 分 request/response；ArchUnit 增至 8 条（新增 R5/R6/R7）；测试 24/24 全绿 |

## 5. 1 期非目标（已遵守）

- 未引入 Agent 实现代码/Spring AI/MCP/A2A 依赖；未做 Maven 多模块、微服务组件、GraalVM 配置
- **显式舍弃（RuoYi 对齐分析结论）**：岗位管理、通知公告、Quartz 定时任务、代码生成器、druid/oshi 监控页、Excel 导入导出、图片验证码、dept.ancestors 冗余列、行级数据权限执行（仅存字段）
- Agent 治理原语已就位：`@AgentExposed`、`/auth/token`（client_credentials 风格）、traceId、审计字段、`@RateLimit`

## 6. 风险与对策（终态）

| 风险 | 状态 |
|---|---|
| Boot 4 生态适配（MP/Redisson/Flyway/Testcontainers 拆分与改名） | ✅ 均已实测解决（见 §2 加粗项） |
| 两级缓存一致性 | 失效广播最终一致（代码注释）；clear 用 KEYS 匹配（注释标注生产换 SCAN） |
| Redis JSON 序列化多态类型信息 | Jackson 3 序列化器 + default typing，限内网可信 Redis（RedisConfig 注释） |
| JWT HS256 对称密钥 | 本地默认值，生产 `JWT_SECRET` 环境变量；README 指引切 RS256 |
| Flyway baseline-on-migrate 与 Modulith 建表顺序 | 全新库正常；接已有库需注意（README 写明） |
| common.event 随模块增多可能膨胀 | 2 期评估按业务线拆 shared-kernel 子包 |

## 7. 2 期候选方向（讨论点清单）

- `agent-integration` 模块：MCP Server + `@AgentExposed` 白名单工具生成 + 治理切面
- A2A AgentCard（视目标平台支持情况）；Nacos A2A 注册中心（规模化后）
- 事件外化到 Kafka/AMQP（Modulith 官方支持）
- **消息中心模块**：站内信 + 已读回执 + SSE 实时推送 + 定向投放（RuoYi 通知公告的现代化形态；CRUD 版公告因无沉淀价值已舍弃，本模块需先定推送通道与定向模型再实施）
- **i18n 插件化评估**：当前契约（数字 code 语言中立 + 前端按 code 本地化）已覆盖主流场景；触发条件（多地区 SaaS/出海/政务多语言）出现时，以 `framework.i18n` 可选装配进入（MessageSource + AcceptHeaderLocaleResolver + ErrorCode message-key 化 + menu/dict 按 key 存储约定），注意动态数据多语言才是真正难点
- 行级数据权限执行（MP DataPermissionInterceptor，非字符串拼 SQL）
- 模块切片测试（`@ApplicationModuleTest`）可行性重估
- **前端工程（独立仓库）**：技术选型窗口已开启（后端契约已稳定）；候选 Vue3+Vben/vue-pure-admin（Element Plus）或 React+antd Pro；前置待办：`/auth/refresh` 刷新令牌、dev 环境 CORS 配置（详见会话分析结论）

## 8. 关键设计决策记录

1. **单 Maven 模块 + Modulith**，不用 Maven 多模块（边界按业务域、测试期强制、重构成本低）。
2. **集成事件契约放 `common.event`**：facade 调用 + 事件监听双向会构成 Modulith 模块循环，事件契约下沉 OPEN 内核后依赖图保持 DAG（AGENTS.md §4）。
3. **简单模块的 Mapper 用 default 方法封装 QueryWrapper/Page 并直返 PageResult**：Service 零 `com.baomidou` import，ArchUnit R1 机器可验。
4. **装箱 Long→String / 原生 long 保持数字**（JacksonConfig 注释）。
5. **sys_menu 统一权限树**（C目录/M菜单/F按钮）：一棵树承载前端路由与后端按钮级 perms。
6. **RuoYi 系统管理三分法对齐**（v1.3）：
   - 保留：RBAC、部门树、字典（边界：枚举进代码、运营可改进字典）、参数配置（仅业务可调参数）、登录/操作日志、在线用户；
   - 优化后保留：部门树用 **PG `WITH RECURSIVE`** 替代 ancestors 冗余列；日志改**事件驱动**（framework 发事件、system 落库，异步且不拖慢请求）+ **参数默认脱敏**（password/token/secret 剔除）；登录安全用**失败锁定 + `@RateLimit` 限流 + 强密码策略 + 审计告警**四件套替代图片验证码（验证码对 OCR/撞库均已失效，且内网管理台场景居多；公网开放端点届时用 Turnstile/极验可选集成）；
   - 舍弃：岗位（纯标签无行为）、公告（见 §7 消息中心）、Quartz（用 k8s CronJob/xxl-job/@Scheduled）、代码生成器（AI Agent + AGENTS.md 替代）、监控页面（Prometheus 体系替代）、Excel 导入导出（按需）、行级数据权限执行（2 期）。
