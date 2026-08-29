# AGENTS.md —— Apocalypse 项目宪法

> 本文件是 AI 编码 Agent 在本仓库工作时的根本约束。效力来自自动化执法，而非自觉。
> 修改架构、新增红线时，必须同步更新本文件与对应的自动化检查。

## 1. 项目定位与技术栈基线

Java 25 + Spring Boot 4.1.x **单 Maven 模块**模块化单体脚手架（刻意不用 Maven 多模块，决策见 `docs/plans/phase-1-scaffold.md`）。基线版本锁定：

- JDK **25**（Temurin，绿色版目录，不做系统安装）
- Maven **3.9.x**（一律使用项目内置 `./mvnw`，禁止使用系统 mvn）
- Spring Boot **4.1.x** / Spring Modulith **2.1.x** / MyBatis-Plus **3.5.x** / springdoc **3.1.x**

**禁止擅自升降级任何基线版本**（含 JDK、Boot、各 starter）。版本调整属于"必须请示"事项。

## 2. 构建与验证命令

```bash
# 环境前置（Windows Git Bash；IDEA 用户在 Project SDK 选 jdk-25 目录即可）
export JAVA_HOME='/d/IDE/JDK/jdk-25.0.4.1+1'

./mvnw compile              # 编译
./mvnw test                 # 全部测试（集成测试需要 Docker 运行中）
./mvnw verify               # 全量门禁：测试 + Spotless + Checkstyle + Enforcer
./mvnw spotless:apply       # 格式化修复（提交前必跑）
./mvnw spring-boot:run      # 本地启动（先 docker compose up -d）
docker compose up -d        # 启动 PostgreSQL 18.6 + Redis 8.10.1
```

环境配置切分：`application.yml`（公共 + `spring.profiles.active`，默认 dev）+ `application-dev.yml`（本地）+ `application-test.yml`（部署态测试环境）+ `application-prod.yml`（生产，纯环境变量、关 swagger）。自动化集成测试用 Testcontainers，不占用 test profile。

提交代码前必须通过 `./mvnw verify`。CI 门禁与此完全一致。

## 3. 架构红线（每条均有执法者）

| # | 红线 | 执法者 |
|---|---|---|
| 1 | 新功能必须落在 `io.apocalypse.<业务域>/` 模块内；跨模块只允许走对方 **`api` 包**的 facade/视图 或 `common.event` 事件 | Modulith `ApplicationModules.verify()`（`ModuleBoundaryTest`） |
| 2 | `common`、`framework` 是 OPEN 共享模块；业务模块之间禁止直接依赖内部实现 | 同上 |
| 3 | MyBatis-Plus 类型（`QueryWrapper`/`Page` 等 `com.baomidou..`）不得出现在 mapper / infrastructure 包之外；豁免：`common`（BaseEntity、PageResult）、`framework.mybatis`（装配）、各模块 `entity` 包（`@TableName` 映射注解） | ArchUnit `LayeringRulesTest` R1 |
| 4 | Controller 返回 `R<T>`；业务错误抛 `BizException`，禁止在 Controller 手写 try-catch 拼响应；`@Transactional` 只允许出现在 service / application 层 | ArchUnit R2/R3 |
| 5 | 模块根包只允许 `package-info.java`；对外暴露面统一 `<module>/api`（`@NamedInterface`）；`dto` 包下请求/响应必须分 `request`/`response` 子包；`@RestController` 必须在 `controller`/`interfaces` 包 | ArchUnit R5/R6/R7 + Modulith |
| 6 | DTO/VO 用 `record`；Lombok 只允许 `@Getter` `@Setter` `@RequiredArgsConstructor` `@Slf4j`，禁用 `@Data`、`@AllArgsConstructor` 于实体 | Checkstyle + 评审 |
| 7 | 禁止引入 Hutool；字符串/集合用 Spring 或 commons-lang3；对象映射用 MapStruct | Enforcer `bannedDependencies` + Checkstyle `IllegalImport` |
| 8 | 数据库变更只能**新增** Flyway 迁移脚本（`V<n>__*.sql`），禁止修改已应用的脚本（首个 release 前修订基线脚本除外） | Flyway validate + 评审 |
| 9 | 对外（含外部 Agent）只允许通过 facade + `@AgentExposed` 白名单暴露能力；禁止向外部系统开放 DB/Redis 直连 | 评审 + 2 期强制扫描 |
| 10 | 日志禁止输出密码、令牌、身份证号等敏感字段；禁止提交任何密钥到仓库；操作日志参数必须经统一脱敏 | `OperLogAspect` 脱敏 + 评审 |

## 4. 分层与分包约定

```
io.apocalypse
├── common/       # OPEN：response(R/ErrorCode/PageResult)、exception(BizException)、entity(BaseEntity)、annotation(@AgentExposed)、event(跨模块集成事件契约)
├── framework/    # OPEN：security / cache / redis / mybatis / openapi / web / log / ratelimit / config 技术装配
├── system/       # 系统管理域：用户/角色/菜单/部门/字典/参数/日志/在线用户
└── order/        # 核心域范本（api/application/domain/infrastructure 分层）
```

**模块内部结构（统一约定，ArchUnit R5/R6/R7 执法）**：

```
<module>/
├── package-info.java     # 根包只允许这一个文件（R5），禁止任何顶层类
├── api/                  # 唯一对外暴露面：package-info 标 @NamedInterface("api")；放 facade 接口 + 共享视图 record
│                         # （跨模块事件不放这里，统一 common.event）
├── <subdomain>/          # 多子域模块按子域分包（单子域模块可直接按下述分层）
│   ├── controller/       # @RestController 只能在此（或复杂模块的 interfaces/）（R7）
│   ├── service/          # 业务服务 + MapStruct Convert
│   ├── mapper/           # MP Mapper，QueryWrapper/Page 封装在 default 方法内
│   ├── entity/           # MP 实体
│   └── dto/
│       ├── request/      # 请求 record（R6：dto 包下禁止直接放类）
│       └── response/     # 响应 record
└── listener/             # 跨模块事件消费者（@ApplicationModuleListener）统一位置
```

- 简单模块（如 system）：子域 → 分层两级结构（上表）；复杂模块（如 order）：`api`/`application`/`domain`/`infrastructure`/`interfaces` 分层，domain 纯 Java。
- 跨模块异步动作用 Spring 事件 + `@ApplicationModuleListener`，禁止直接调对方 Service/Mapper。**事件契约统一放 `common.event`**：若事件放发布方 api 包，消费方对发布方的依赖与反向 facade 调用易形成模块循环（Modulith verify 拒绝）；沉淀到 OPEN 内核后依赖图保持无环。

## 5. 统一约定

- 响应：一律 `R<T>`（由 `ResponseBodyAdvice` 自动包装，Controller 返回裸数据即可）。
- 异常：业务错误 `throw new BizException(...)`；系统异常由全局处理器兜底，禁止裸抛栈到前端。
- 分页：跨层传递用 `PageResult<T>`，禁止 MP `Page` 泄漏到 Service 以上。简单模块的 Mapper 用 `default` 方法封装 `QueryWrapper`/`Page` 并直接返回 `PageResult`，Service 严禁 import `com.baomidou`。
- 通用字段：`BaseEntity` 统一承载 `id` / `createTime` / `createBy` / `updateTime` / `updateBy` / `version` / `deleted` / `remark`。其中 `createTime`/`createBy` 仅插入填充（`FieldFill.INSERT`），`updateTime`/`updateBy` 插入与更新均填充（`INSERT_UPDATE`），`version`/`deleted` 插入填充（默认 0），填充处理器见 framework-mybatis 的 `MetaObjectHandler`；`remark` 是用户输入的业务字段，**不加 fill 注解**、不参与自动填充，各实体禁止再自行声明。例外：`sys_login_log` / `sys_oper_log` 等 append-only 日志表不继承 `BaseEntity`（无 version/deleted/update 审计字段，只插不改）。
- ID 约定：业务实体一律继承 `BaseEntity`，主键为雪花 `Long`（`@TableId(IdType.ASSIGN_ID)`），禁止 AUTO 自增与 UUID 混用；联表（`sys_user_role` / `sys_role_menu`）用联合主键、不设 id 列；种子与系统内置数据允许使用小整数 id（可读性）；append-only 日志表不继承 `BaseEntity` 但主键同样保持雪花；对外 JSON 中装箱 `Long` 序列化为 String（防 JS 精度丢失，Jackson 已配）；雪花 workerId 由 MyBatis-Plus 按机器自动分配，多副本部署无需额外配置。
- 时间：实体用 `LocalDateTime`；对外 JSON 中装箱 `Long` 主键序列化为 String（Jackson 已配，原生 long 不受影响）。
- 缓存：用 `@Cacheable` 等注解 + 脚手架两级缓存；禁止徒手读写 Redis 当缓存用。
- 权限：统一 `sys_menu` 树（C目录/M菜单/F按钮），按钮节点 `perms` 即接口权限串；perms 命名约定 `域:对象:动作`（如 `system:user:list`），后端用 `@PreAuthorize("hasAuthority('...')")` 校验；角色用 `ROLE_<role_key>` 前缀。
- 登录安全：失败 N 次锁定（Redis 计数）+ `@RateLimit` 限流 + 强密码策略 + 登录日志审计，不使用图片验证码；公网开放端点的机器人防御用 Turnstile/极验可选集成。
- 日志：登录/操作日志一律**事件驱动**（framework 发事件、system 域监听落库）；操作日志参数由 `OperLogAspect` 统一脱敏。
- 部门树：用 PostgreSQL `WITH RECURSIVE` 递归查询，禁止引入 ancestors 式冗余路径列。
- 错误消息：中文直出，`R.code` 数字为语言中立契约；不做后端 i18n 实现（触发条件与进入方式见 `docs/plans/phase-1-scaffold.md` §7）。

## 6. 必须请示人类的事项（Agent 停手条款）

1. 新增/升级/删除任何 Maven 依赖
2. 修改公开 API 契约（`R` 结构、facade 签名、事件字段）
3. 数据库 schema 变更（新增 Flyway 脚本除外，内容需评审）
4. 新增业务模块（先确认模块边界划分）
5. 修改本文件、ArchUnit 规则、CI 门禁
6. 任何 `git commit/push` 等版本库写操作

## 7. 测试要求

- 集成测试用 Testcontainers（PostgreSQL/Redis 容器，全上下文 `@SpringBootTest`），禁止连真实环境。
- 模块切片测试（`@ApplicationModuleTest`）暂不作为强制项（数据装配在 framework 模块，独立切片成本高，2 期再评估）。
- 边界与分层测试（Modulith verify、ArchUnit）不许删除或注释来"通过"构建。

## 8. 文档维护

- 结构、命令、约定变化时，同 PR 更新本文件与 `README.md`。
- 模块级细则可放 `<module>/AGENTS.md`（优先级高于本文件）。
