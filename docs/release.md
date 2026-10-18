# 发行与兼容契约

当前前后端统一为 **`0.1.0-rc.1` 首版预发布**，尚未发布稳定版本。[GitHub Release](https://github.com/lilibonk/apocalypse/releases/tag/v0.1.0-rc.1) 提供固定 tag 对应的发布包和 SHA-256 校验值；版本号不表示跨平台、容量或完整供应链保证。项目自有部分采用 [Apache License 2.0](../LICENSE)，第三方代码与依赖依[各自声明](../THIRD_PARTY_NOTICES.md)授权。

## 首次发行的制品边界

一次发行固定同一 Git commit，记录后端 JAR、前端构建产物和对应源码的版本与校验值，并提供[变更记录](../CHANGELOG.md)、配置差异、数据库迁移清单和复核结果。前后端按同一版本演进；候选构建会拒绝版本不一致。项目许可文本已在仓库，但每次发行仍须复核实际制品内的直接及传递依赖通知和素材来源。

仓库不提供代码生成器。线上任务调度平台和公告不在本次发布范围；基础设施内部的审计恢复轮询不构成任务调度平台。业务动作授权与 C/M 导航独立管理。部门行级权限提供 ALL、DEPT、DEPT_AND_CHILDREN，支持角色默认范围及逐权限 override；只有授予同一操作的有效角色参与范围合并，覆盖用户查询/写入、部门选项与高权限账号保护。授权支持暂停和 UTC 固定有效期，由服务端实时判定。初始基线为内置管理员角色显式设置 ALL，新建角色默认 DEPT。

## 构建可核验的本地候选

在干净的待发行 checkout 中配置 Java 25 与 Testcontainers 所需 Docker 环境，然后执行：

```bash
node scripts/candidate-manifest.mjs build
node scripts/candidate-manifest.mjs verify target/scaffold-candidates/<commit前12位>-<manifest摘要前12位>
# 在仓库根目录单独核对 JAR 与当前随附通知索引；仍需同一 JDK 环境。
node scripts/candidate-manifest.mjs verify-notices target/apocalypse-0.1.0-rc.1.jar
```

构建先执行后端 `clean verify`、前端锁文件安装、`pnpm check` 与 `pnpm test:browser`、公开文档链接检查。构建前后工作树必须干净，HEAD 不得改变；前端 `.env` 覆盖文件和 `VITE_*` 环境变量会被拒绝。候选包含可执行 JAR、静态 dist、参考部署文件、原始许可与依赖清单；`manifest.json` 记录版本、源码 commit/tree 与逐文件 SHA-256。校验会拒绝缺失、篡改、额外文件和符号链接。

构建还会把实际 JAR 的嵌套依赖集合及每包 hash 与后端通知索引比较，核对嵌入通知与源文件一致，并检查前端生产依赖和构建贡献的版本均有对应通知。依赖变化却继续携带旧通知会被拒绝；不能用 Maven dependency tree 推断打包后一定包含同一组文件。

提交前审阅可执行 `node scripts/candidate-manifest.mjs build-review`：它保留同一完整门禁，使用构建前后的逐文件内容/hash 绑定未提交来源，清楚标记为 review-candidate。它不代表干净 Git 发行；来源变化会使打包失败。通过校验的候选可以直接作为 `scripts/deployment-smoke.mjs --candidate <目录>` 输入，以同一 JAR/dist 验证。

浏览器升级会清除旧 localStorage 令牌并要求重新登录；access 只在内存，refresh 为同源 HttpOnly/Secure/SameSite=Strict Cookie。prod 新增精确 HTTPS `PUBLIC_ORIGIN`，不配置会拒绝启动。旧非浏览器 JSON 令牌接口保留。新密码带 {bcrypt}，合法旧 bcrypt 仍可验证；新密码最多 72 UTF-8 字节。回退旧 raw-only encoder 或旧前端会改变该行为，须前后端配对验证。

这是一项本地构建工具，不会创建 tag、上传制品或发布 GitHub Release。候选完整性校验只能证明文件与清单一致，不能代替供应链、权限或部署验收；许可清单中的待审状态必须按实际审阅证据处理。

现行验证基线是 Java 25、仓库 `./mvnw` 的 Maven 3.9.x、CI 的 Node.js 24 和 pnpm 11.19.0，以及集成测试所用 PostgreSQL 18.6、Redis 8.10.1。`docker-compose.yml` 只代表本机开发配置；这组版本是目前接受测试的组合，不等于已经验证全部生产平台。若要承诺其他 JDK、数据库或 Node 版本，需先增加对应运行验证。

开发文档 UI 只应用于项目自身生成的可信 OpenAPI。随包 Swagger UI 5.32.14 的 YAML 合并逻辑仍存在[空合并来源可绕过工作预算的问题](https://github.com/nodeca/js-yaml/security/advisories/GHSA-2883-xcg3-v3hh)，不要加载外来或不可信 YAML 文档。生产文档与静态 WebJar 入口默认关闭，但包内代码仍在；构建通过不等于该上游问题已修补。其源映射对应的 qs 版本也有公告，当前证据尚未确认易受影响的函数被编入制品。保留这些证据限制，不能宣称全部依赖无已知问题；若要支持外来文档，须先完成独立修补和浏览器验收。

## 模块与数据的兼容含义

- 新业务域仍编译进同一后端制品，由 `@ModuleConfiguration` 接入；模块边界由 `./mvnw verify` 检查。当前没有运行时安装、卸载 JAR 的插件机制。
- Calendar 是默认关闭的试验能力。即使关闭，代码、初始基线中的 Schema 和既有数据仍随同一制品保留；关闭影响运行入口、菜单和权限，不是数据库卸载。早期 Order HTTP 已退役，兼容表、隐藏权限种子及事件桥仍在。
- 现行 `V1__init.sql` 来自早期开发基线整理；空库安装依次执行 V1 与后续迁移，已使用现行 V1 的数据库通过追加 `V2__permission_authorization.sql` 转换业务授权与导航关系，保留业务数据。更早开发期 V1–V11 的数据库历史不同，不支持直接套用；可丢弃的旧开发库须重建。不要使用 Flyway repair 或自动 baseline 绕过差异，已应用的发行脚本不可改写。
- V2 授权模型是一次维护窗口切换：先备份并停掉全部旧实例及令牌签发入口，核验重复权限的逐角色等价性和模块归属，再配套部署新前后端与全新的 JWT 签名密钥。本候选的 Flyway 链还包括 V3 Calendar 修订历史索引，须将索引构建计入维护窗口。用户重新登录，服务账号重新签发并核验管理 scope。数据库恢复也必须使用新的签名密钥，禁止恢复旧 key；独立授权写入后只允许兼容新模型的版本修复。完整步骤见[运行与升级](operations.md#v1-到-v2-的维护窗口切换)。新 Schema 不保证旧 JAR 能直接启动，Calendar 写入协议变动时也不应未经验证混跑。
- 新模块在入口提供 `PermissionActionDefinition` 纯元数据，并用新增迁移提供匹配的权限定义；统一 `LiveAuthorizationManagerFactory` 执行实时判定。旧角色 `/menus` 协议已拒绝读写，消费方需改用带修订号的 `/permissions` 与 `/navigation` 增量协议。`/system/users/me` 增加授权快照、评估时刻、下一时间边界及逐权限 ALL 信息；前端必须采用配套的授权生命周期，不能从旧 JWT 或导航反推业务权限。
- `0.x` 开发阶段的公开 API、前端页面约定与扩展点还没有跨版本兼容承诺。若要把某项 facade、事件或配置键列为稳定契约，应在发行记录中明确支持范围、迁移方式和废弃周期；修改现有公开契约仍须按仓库约束评审。

## 发行前验收

1. 从待发行 commit 的干净克隆执行[快速开始](getting-started.md)，运行公开文档链接检查、后端 `./mvnw --batch-mode verify` 和前端 `pnpm check`，并保存通过的构建日志与制品校验值。
2. 用独立的最小模块复核装配、Flyway、动作声明、业务授权与导航、前端页面/查询身份与可选能力开关；核对有效期边界、范围收缩与对象归属，记录未覆盖的复杂业务场景。现有[模块开发指南](module-development.md)对应本地隔离演练，尚未证明任意下游模块自动兼容。
3. 在与目标部署相同的环境演练空库安装及从上一版本升级，核对备份恢复、迁移耗时、可选能力启停、健康与业务失败指标，并记录应用回退是否与新 schema 兼容。V1→V2 还须逐角色比对迁移结果，验证切换和恢复后的 access/refresh/client 旧凭据拒绝屏障及新凭据可用性。
4. 复核项目许可及完整第三方通知，确定正式版本编号、变更记录和支持矩阵，再由发行负责人批准 tag 与对外分发。当前仓库没有自动发布流水线；不能以 CI 构建成功替代这一步。

[运行与升级](operations.md)列出配置和升级限制，[参考部署](deployment.md)提供单机安装与恢复步骤。本轮目标是可追溯、可演练的首版候选；在依赖安全、部署恢复和部门权限范围验收关闭前，不应以稳定版对外发布。
