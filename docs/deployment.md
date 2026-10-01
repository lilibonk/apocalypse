# 单机部署与恢复

本参考把同一发行版本的 JAR 和前端静态目录部署到单机 Linux Docker：nginx 提供 HTTPS 和 `/api/` 代理，Temurin 25 运行后端，PostgreSQL 18.6 保存数据，Redis 8.10.1 保存缓存与会话辅助状态。根目录的 `docker-compose.yml` 仍仅用于本地开发。

参考配置在 [deploy/compose.yml](../deploy/compose.yml)，运行时配置和密钥放在仓库之外。首版支持范围限定为已测的 Linux arm64 单机环境（本机 Linux VM）；具体发布包和同包验收范围见 [GitHub Release](https://github.com/lilibonk/apocalypse/releases/tag/v0.1.0-rc.1)。官方镜像也提供 amd64，但未把本轮 arm64 结果当作 amd64、HA、压力测试或公网生产环境验收。没有前一正式版本，因此不承诺从任意开发库原地升级。

## 准备与首次启动

需要 Docker Engine、Compose 插件，以及用于准备文件的 Node.js 24。当前参考镜像都使用 tag 与 SHA-256 摘要双重标识；启动使用 `pull_policy: never`。先在线取得镜像，校验发行包，再运行。镜像和主机系统的补丁、许可与运行权限由部署者一并维护。

以专用、非 root 的部署用户执行以下命令。该用户需要能管理目标 Docker 引擎；`/srv` 下目标目录的父目录须事先授予它写权限。`prepare.mjs` 会拒绝已存在的目标目录，生成独立的随机凭据、复制制品，并保持密钥文件 `0600`、私有目录 `0700`。不要将部署目录放进 Git。

```bash
# 从解压并校验后的发行包根目录执行；替换成包中实际的 JAR 文件名。
node deploy/prepare.mjs /srv/apocalypse backend/apocalypse-0.1.0-rc.1.jar apocalypse-web/dist

# 保持这一函数的项目名、运行目录、Compose 文件三个目标一致。
dc() {
  docker compose --project-name apocalypse-prod \
    --env-file /srv/apocalypse/deployment.env -f deploy/compose.yml "$@"
}
```

源码检出场景可把两个制品参数换成实际的 `target/apocalypse-<version>.jar` 与 `apocalypse-web/dist`；先完成后端 `verify` 和前端 `pnpm check`。不能混用不同版本的前后端产物。

准备完成后：

1. 将证书完整链放入 `/srv/apocalypse/tls/server.crt`，相应私钥放入 `server.key`，私钥保持 `0600`。证书必须覆盖实际访问域名。不要把临时演练证书用于公网，也不要关闭客户端证书校验。
2. 审阅 `/srv/apocalypse/deployment.env`。默认仅监听 `127.0.0.1:8443`；直接对外服务时显式设置 `HTTPS_BIND` 和 `HTTPS_PORT`（例如 `0.0.0.0` 和 `443`），并配置 DNS 与主机防火墙。将 PUBLIC_ORIGIN 设为浏览器实际访问的精确 HTTPS 来源（如 https://admin.example.com，无路径/尾斜线）；端口必须与访问地址一致。模板仅提供 HTTPS，不开放 HTTP 端口。
3. 把 `secrets/bootstrap-admin-password` 的初始口令安全存入自己的密码管理工具。不要把密钥作为命令参数、终端日志或工单内容，也不要执行带 shell trace 的启动脚本。
4. 启动并验证：

```bash
dc pull
dc up -d --wait --wait-timeout 240
dc ps
```

打开实际 HTTPS 地址，以 `admin` 和本地生成的初始口令登录，读取用户列表并完成一项授权范围内的写入。成功后清空一次性 bootstrap 文件并重新创建后端。文件本身保留，因为 Compose 的 secret 挂载必须存在；此操作不会改变已初始化的管理员密码。

```bash
: > /srv/apocalypse/secrets/bootstrap-admin-password
dc up -d --force-recreate --wait --wait-timeout 180 backend
```

后端读取的是 `apocalypse.security.bootstrap.admin-password` 这个完整配置键。开发环境中的 `APOCALYPSE_BOOTSTRAP_ADMIN_PASSWORD` 简写不是本模板的生产注入方式。

## 配置与网络边界

| 项目       | 参考配置                                                                                                                               |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 后端配置   | `SPRING_PROFILES_ACTIVE=prod`；DB URL/用户名、Redis 主机/端口为容器网络内固定名称                                                      |
| 浏览器来源 | PUBLIC_ORIGIN 精确 HTTPS 来源；HttpOnly/Secure refresh Cookie，CSRF 与 Origin 拒绝校验                                                 |
| 密钥       | Spring Boot `configtree` 挂载 DB/JWT/Redis/bootstrap 文件；Compose 输出不包含密钥值                                                    |
| 数据库     | 管理凭据仅供 PostgreSQL 初始化；应用使用非 superuser、无创建角色/数据库权限的 `apocalypse` 角色，由它拥有应用库                        |
| Redis      | 单独随机密码、AOF 持久化；不发布宿主机端口                                                                                             |
| 应用权限   | 以生成文件的部署 UID/GID 非 root 运行、只读根文件系统、临时目录在 tmpfs                                                                |
| 网络       | 仅 nginx 发布 HTTPS；后端/数据库/Redis 无宿主机端口；应用和数据网络设置为 internal                                                     |
| 代理       | `/api/` 剥去前缀后转发；SPA 深链回到 `index.html`；缺失的 `/assets/` 返回 404                                                          |
| 健康与文档 | 生产 OpenAPI 和后端默认静态映射关闭；代理另拒绝 Swagger UI/WebJar/文档入口，仅放行 `/api/actuator/health` 的摘要，其余 Actuator 被拒绝 |
| 可选能力   | Calendar 默认关闭，但代码和 Schema 迁移仍随 JAR 发布，关闭不删除历史数据                                                               |

关闭 springdoc 的 UI/API 配置并不删除 JAR 中的 WebJar；此前诊断实测中，认证用户仍可读取 Swagger JavaScript。本次 `application-prod.yml` 已设置 `spring.web.resources.add-mappings=false`，让生产后端自身禁用默认静态资源映射；前端静态资源继续由 nginx 独立提供。nginx 同时按准确路径边界拒绝 Swagger UI、WebJar 和 OpenAPI 文档入口，保留相邻的业务 API 前缀。未知 API 仍按统一契约返回 `R.code=40400`。

发行验收同时检查代理与后端直连：代理返回 HTTP 404，后端认证后的真实 Swagger WebJar 请求返回 `R.code=40400`，并复核正常 API 和恢复流程。静态资源不可达也不代表 JAR 中的依赖已消失或已知漏洞已经修复，依赖风险仍按[发行契约](release.md)处理。

`deployment.env` 只保存非秘密路径与 UID/端口。Compose secrets 在这里是受限的宿主机文件挂载，不是加密秘密管理服务。不要修改 `APP_UID` 后忘记同步文件所有者；否则应用无法读取 `0600` 密钥。移动部署时要同时保全权限、证书和受控凭据记录。

nginx 覆盖外来 `Forwarded`/`X-Forwarded-*`，由后端识别代理后的 HTTPS 来源。若前面再加网关/CDN，需重新定义可信代理和真实客户端 IP，不能直接把客户端提供的转发链视为可信。此参考不需要应用运行期外网；要接第三方服务须审阅新增的出站网络范围。

## 健康、业务失败与日志

容器健康检查只用于启动与依赖可达性。nginx 的本地 readiness 只能证明进程和静态服务；后端故障时首页仍可能返回 200。外部探针至少检查 HTTPS 证书、`/api/actuator/health` 的 `status=UP`，以及一个经认证的只读接口的 `R.code=0`。

业务失败可能使用 HTTP 200，通过 `R.code` 表达。错误密码、权限拒绝、参数校验失败不能因为 HTTP 成功而当作业务成功。生产默认没有公开 Prometheus 抓取端点，也没有自动配置告警接收方；需要告警系统时按自己的运维方案接入并验证。参考的 Docker 日志按每容器 `10m × 3` 轮转；这是磁盘上限，不是审计保留策略。

nginx 访问日志省略查询串、认证头、请求与响应体。后端审计恢复和保留周期遵循应用配置。检查日志时同样不要把真实凭据、用户数据和完整数据库 dump 上传到问题跟踪系统。

## 停写备份与新卷恢复

此流程使用 PostgreSQL 自定义格式的逻辑备份。备份包含业务数据、密码哈希与审计，必须按敏感数据加密保管并限制访问；不能放进仓库或发行包。备份频率决定数据恢复点，首版不提供 PITR 或零数据丢失保证。

维护窗口中停止后端写入，保留数据库服务，再取得备份及校验值。下面示例只操作上文 `dc` 函数绑定的部署。

```bash
umask 077
dc stop backend
dc exec -T postgres pg_dump -U postgres -d apocalypse \
  -Fc --no-owner --no-acl > /secure-backups/apocalypse.dump
# 在恢复主机上使用同一 SHA-256 工具核验该文件。
sha256sum /secure-backups/apocalypse.dump
dc up -d --wait --wait-timeout 180 backend
```

不要对仍接收写入的实例直接覆盖还原。保留原实例，以不同的 Compose 项目名和全新运行目录/数据卷恢复；恢复失败时原实例仍可供分析或回切。

```bash
node deploy/prepare.mjs /srv/apocalypse-restore backend/apocalypse-0.1.0-rc.1.jar apocalypse-web/dist
```

为恢复实例安装适配的 TLS 文件，在其 `deployment.env` 配置不冲突的 HTTPS 端口；保留新生成的 JWT/DB/Redis 密钥，并清空恢复实例的 bootstrap 文件。数据库备份中的现有管理员密码哈希会被恢复，新生成的 bootstrap 口令不适用于这些账号。

```bash
: > /srv/apocalypse-restore/secrets/bootstrap-admin-password
restore_dc() {
  docker compose --project-name apocalypse-restore \
    --env-file /srv/apocalypse-restore/deployment.env -f deploy/compose.yml "$@"
}
restore_dc up -d --wait --wait-timeout 90 postgres redis
restore_dc exec -T postgres pg_restore -U postgres -d apocalypse \
  --exit-on-error --no-owner --no-acl --role=apocalypse < /secure-backups/apocalypse.dump
restore_dc up -d --wait --wait-timeout 240
```

恢复完成后检查 Flyway 状态、健康、旧管理员登录、权限边界和备份中的业务记录，再决定流量切换。Redis 使用新空卷重建；JWT 密钥变化会让旧 access/refresh token 失效，用户必须重新登录。不要恢复过时 Redis 快照并保留旧 JWT 密钥，否则可能重新接受已经消费过的 refresh token。

数据库恢复点之后的写入不在该备份内。切流前应明确是否丢弃这些写入或另行核对迁移，不能把成功还原一次合成记录当作真实数据完整性承诺。

## 失败回退

替换制品前保留已验证 JAR、前端目录及其校验值，同时取得数据库备份。停止后端后替换两个制品；用 `dc up -d --force-recreate --wait backend frontend` 重新挂载并检查健康与业务。Compose 自动重启无法修复损坏 JAR 或配置错误，启动失败要终止切流。

若新制品在执行数据库迁移前启动失败，可恢复原 JAR/前端并重新创建容器；演练脚本覆盖此路径。已经应用新 Schema 时，不保证旧 JAR 能读取新库。此时应按该版本迁移说明决定前滚修复，或把部署前备份恢复到新卷并配对旧制品，验证后切流；不能通过删改已应用 Flyway 文件或 `down --volumes` 尝试回退生产数据库。

## 可重复演练与离线运行

演练脚本只操作新生成的 `apocalypse-release-*` 项目、卷和网络，只写合成配置记录。它验证空库安装、非特权数据库角色、临时 CA 校验、bootstrap 登录、代理/SPA、业务失败、重启、独立新卷恢复、令牌失效和损坏 JAR 回退。

```bash
node scripts/deployment-smoke.mjs \
  --candidate target/scaffold-candidates/<目录> \
  --out .verify/deployment-run
```

正式/评审候选使用 --candidate 并先核验 manifest，自动绑定 JAR/dist 和实际捆绑静态资源路径。单独 JAR/dist 诊断可用 --artifact-kind diagnostic；不携候选却声明 release-candidate 会被拒绝。需要真实浏览器联调时加 --browser-checkpoint required，在隔离恢复环境保留验证点并等待匹配报告后再清理；私有凭据不输出。需要记录某个捆绑静态资源的匿名/认证可达性时，可传 `--probe-static-resource /api/webjars/<实际资源路径>`，报告只记录状态、类型、字节数和 hash，不保存响应体或令牌。

`--out` 必须是不存在的目录，父目录需已存在。输出保留各步骤结果、制品与镜像 hash、已脱敏日志；结束时删除本次容器、网络、数据卷、临时凭据、证书私钥和合成备份。临时 CA 只由本次测试客户端信任，不写入系统信任库。若清理失败，脚本返回失败并保留清理所需的运行目录，应先按报告定位它自己的项目处理，不使用全局 Docker prune。

离线环境须预先在目标平台准备并校验发行包与全部镜像。可用 `docker image save` 将 `dc config --images` 输出的摘要镜像保存到受控介质，到目标机 `docker image load`；在断网前用 `docker image inspect` 确认 Compose 中每个精确摘要都可解析。运行时不用下载 Node 包或 Maven 依赖，`pull_policy: never` 防止隐式获取漂移镜像。此流程证明本组合在已预置镜像后可运行，不涵盖操作系统安装或离线补丁供应链。
