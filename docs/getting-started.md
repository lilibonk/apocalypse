# 快速开始

以下命令用于本地开发和验证，不是生产部署配置。前置环境以仓库现行文件为准：JDK 25、Docker Compose、Node.js 24（CI 使用）与 `apocalypse-web/package.json` 声明的 pnpm 11.19.0。Maven 使用仓库内 `./mvnw`，无需系统 Maven。Windows 可在 Git Bash 运行下方 shell 命令；PowerShell 使用 `mvnw.cmd` 并按其环境变量语法设置相同变量。

先取得代码并进入仓库根目录（私有仓库需具备访问权限）：

```bash
git clone https://github.com/lilibonk/apocalypse.git
cd apocalypse
```

## 1. 准备本地服务和一次性管理员密码

在仓库根目录确认 `java -version` 是 25，Docker daemon 已运行。当前 shell 中为 JWT 生成私有签名密钥，并输入符合至少 8 位、同时含字母和数字要求的首次管理员密码：

```bash
export JWT_SECRET="$(openssl rand -hex 32)"
printf '首次 admin 密码: '
IFS= read -r -s APOCALYPSE_BOOTSTRAP_ADMIN_PASSWORD
printf '\n'
export APOCALYPSE_BOOTSTRAP_ADMIN_PASSWORD
docker compose up -d
./mvnw spring-boot:run
```

`JWT_SECRET` 只在当前 shell 中保存，不要放入仓库或复制到聊天/日志。另开终端运行前端时不需要复制这个密钥。首次成功启动后，在后端 shell 执行 `unset APOCALYPSE_BOOTSTRAP_ADMIN_PASSWORD`；已启用的 `admin` 不会在后续启动时被重置。Compose 只把 PostgreSQL 18.6 和 Redis 8.10.1 绑定到本机回环地址。

## 2. 启动前端并验证登录

在另一个终端中：

```bash
cd apocalypse-web
pnpm install --frozen-lockfile
pnpm dev
```

打开 `http://localhost:5173`，使用 `admin` 和刚才输入的密码登录。开发服务器将 `/api` 代理到 `http://localhost:8080`；需要换本地后端地址时，在启动前端前设置 `APOCALYPSE_API_PROXY_TARGET`。后端 Swagger UI 位于 `http://localhost:8080/swagger-ui.html`。首次启动若失败，先检查 JDK 版本、Docker 服务健康状态、`JWT_SECRET` 与密码策略；不要改用真实环境数据库做排障。

## 3. 运行项目检查

```bash
# 仓库根：单元/架构测试、Testcontainers 集成测试和格式/风格/依赖门禁
./mvnw --batch-mode verify

# 前端目录：格式、lint、测试和构建
cd apocalypse-web
pnpm check
```

集成测试启动独立 PostgreSQL/Redis 容器，不使用 dev profile 的现有数据。macOS/Colima 若 Docker socket 不在 `/var/run/docker.sock`，给测试进程设置实际 `DOCKER_HOST` 和 `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock`。`CalendarPerformanceIT` 是显式选择的性能测试，普通 `verify` 不执行它。

下一步按[模块开发指南](module-development.md)接入独立业务域；运行和升级注意事项见[运行与升级](operations.md)。
