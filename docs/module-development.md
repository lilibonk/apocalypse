# 开发业务模块

Apocalypse 是单 Maven 模块的模块化单体。业务代码放在 `io.apocalypse.<业务域>/`，由 Spring Modulith 和 ArchUnit 在 `./mvnw verify` 中检查边界；前端页面放在 `apocalypse-web/src/views/<业务域>/`。下列步骤描述现有扩展点，不代表仓库已经提供模块生成器。不要把 Calendar 的日期领域模型复制为一般业务模板。

## 后端接入顺序

1. 确定独立业务域及权限前缀。模块根包只放 `package-info.java`；对外 facade 和共享视图放在 `api/`，由 `@NamedInterface("api")` 标记。跨模块调用仅走对方 `api` 或 `common.event`。复杂域可采用 `application/domain/infrastructure/interfaces`，简单域可按子域组织 controller/service/mapper/entity/dto。
2. 在本模块 `infrastructure/config/` 提供一个 `@ModuleConfiguration` 入口，只扫描本域并显式导入运行配置。扫描需排除配置类并保留 `TypeExcludeFilter`，MapperScan 也只能限定本域。常驻的 system 与可选模块采用不同装配方式；需要开关时，先复用 `framework.capability` 的声明、guard 与 `@ConditionalOnCapability`，不要另造前端或 Redis 开关。实际双模块启停参考测试专用的 `src/test/java/io/apocalypse/fixture/` 和 `OptionalModuleLifecycleIT`。
3. 用 `record` 定义 `dto.request` / `dto.response`。Controller 位于 `controller` 或 `interfaces`，返回裸业务值，由统一响应层包装为 `R<T>`；业务错误抛 `BizException`。持久化对象和 MyBatis-Plus 查询类型留在 mapper/infrastructure，不暴露到模块 API。
4. 数据库 DDL 只新增按顺序命名的 Flyway `V<n>__*.sql`，并为菜单/按钮权限准备相应数据。可选模块的菜单 `module_key` 必须与能力 key 一致。后端接口用 `@PreAuthorize("hasAuthority('域:对象:动作')")`；含用户归属的数据从登录身份推导 owner，在读取与写入两侧做对象授权。已有迁移不可重写。

最小可选模块可以按以下文件清单接入。`<key>` 是同一个能力 key；迁移版本号与菜单 ID 必须在当前仓库中选择未占用值，不能直接复制别的模块的种子 ID。测试夹具 `src/test/java/io/apocalypse/fixture/` 展示装配写法，但它只在测试 classpath、测试 profile 下生效，不能原样当成生产模块。

```text
src/main/java/io/apocalypse/<key>/package-info.java
src/main/java/io/apocalypse/<key>/api/package-info.java
src/main/java/io/apocalypse/<key>/api/*Facade.java
src/main/java/io/apocalypse/<key>/infrastructure/config/*ModuleConfiguration.java
src/main/java/io/apocalypse/<key>/infrastructure/config/*RuntimeConfiguration.java
src/main/java/io/apocalypse/<key>/interfaces/*Controller.java
src/main/resources/db/migration/V<n>__<key>_*.sql
```

## 前端接入顺序

1. 页面放在 `src/views/<业务域>/`，标准 CRUD 优先用 DynaLayer schema；`src/views/system/user/index.tsx` 是现有页面范例。后端契约可由本模块的 `*.api.ts` 通过 `src/lib/api/client` 适配，不在组件中直接 `fetch`；请求选项必须显式展开 `{ ...transport }`，把捕获的 `signal` 与身份上下文传到底层。
2. 模块自己的 `i18n/` 提供唯一 namespace 的中英文 locale pack；构建期 loader 自动发现，不修改全局静态业务名单。菜单的 `component` 与页面路径保持一致，权限由后端最新 `/system/users/me` 决定。
3. 可选模块只在自己的 `*.queries.ts` 声明 `ModuleScope`；页面 `index.tsx` 导出这个既有 scope 作为 `queryScope`，并用 `ModuleAccess` 包住页面。查询用 `useQuery(模块查询定义(...))`，页面与 DynaLayer 复用相同的查询/操作定义。撤权、换号、刷新后的旧请求不可回填结果。细则与反例门禁见[前端 AGENTS.md](../apocalypse-web/AGENTS.md)。

可选页面至少对应 `src/views/<key>/index.tsx`、`<key>.api.ts`、`<key>.queries.ts` 与 `i18n/index.ts`。菜单 `component='<key>/index'` 通过约定映射到该页面；页面导出的 `queryScope.moduleKey` 必须等于菜单的 `module_key`，中英文 locale pack 的叶子键须一致。

## 有状态与归属数据的接入

只读示例验证的是装配路径，不能直接证明业务写入与对象授权。新增包含用户归属的数据时，先在服务端从 `SecurityUtils.currentUserId()` 取得身份；创建时由服务端写入 `owner_id`，请求体中的 `userId` / `ownerId` 不作所有权依据。详情、列表、修改和删除查询必须带 owner 约束，记录存在但不属于当前用户时不能返回内容。业务记录 ID 沿用雪花 `Long`，MyBatis-Plus 类型留在 mapper/infrastructure，写操作的事务放在 service/application 层。

菜单页与按钮权限分别声明 `域:对象:动作`，给需要的角色建立关系；可选模块每个菜单的 `module_key` 必须与后端能力 key 和前端 `ModuleScope` 一致。Flyway 版本、菜单 ID 与权限串先在目标仓库查重，不从示例补丁原样复制。验证时用两个都具有接口权限的账号做读写：同权限不等于同 owner；再检查无权限账号、模块关闭/重启和迁移仍在的状态。

前端写操作在模块 `*.queries.ts` 通过同一个 scope 的 `operation` 定义，组件用 `useModuleMutation` 调用，并提供 `localKey` 与 `onDenied`。对象级 403/404 可能不改变 `/me`，应使用 `useResourceDenial` 清掉被拒对象的缓存和编辑态；成功后只通过模块查询定义的 `filter` 失效相关查询。详情 ID、分页和筛选条件必须进入 query 参数身份；不要在异步回调结束后重新捕获当前授权来写旧结果。现有[只读接入补丁](../examples/consumer-probe.patch)仍是最小装配练习，写路径需按本节补全。

## 完成检查

从新库启动时确认迁移、菜单、角色与接口权限一致；分别核查有权、无权和对象不属于当前用户的路径。可选模块还需验证开、关、重启和旧权限缓存；关停不能跳过共享 Flyway 与安全校验。运行 `./mvnw --batch-mode verify` 和前端 `pnpm check`；测试必须使用 Testcontainers，不连接已有业务环境。

可在**一次性克隆**中应用[最小消费方补丁](../examples/consumer-probe.patch)，重复一个无业务含义的只读 `probe` 模块演练。补丁针对当前 V10 基线，包含仅用于演练的 V11 迁移、菜单、后端接口/启停 IT 和前端页面；不要把这份试验数据当作正式模块提交。若目标分支已有后续迁移或占用了种子 ID，应先改用空白隔离副本或调整示例，不覆盖已应用迁移。

```bash
git apply --check examples/consumer-probe.patch
git apply examples/consumer-probe.patch
./mvnw --batch-mode verify
cd apocalypse-web
pnpm install --frozen-lockfile
pnpm check
```

2026-09-23 曾在从拟交付 Git 文件树导出的隔离副本中完成上述演练，后端与前端检查通过。它证明当前最小接入路径可用；仓库仍未提供模块生成器，也未做真实业务复杂度或跨版本升级验收。
