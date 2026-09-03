# Calendar v1 · 验证记录

OPC：`OPC-20260830-calendar-v1`；2026-09-03。此处只公开项目测试与检查摘要，不公开原始个人笔记、浏览器会话、凭证或业务内容。

## 可复现命令

使用仓库规定的 JDK 25、Maven wrapper、pnpm 与可用 Docker；macOS 非默认 Docker socket 见根 README。

```bash
./mvnw --batch-mode spotless:apply
RUN_CALENDAR_PERF=true ./mvnw --batch-mode verify
cd apocalypse-web
pnpm format
pnpm check
cd ..
node docs/calendar/verify-docs.mjs
shasum -a 256 -c docs/calendar/evidence/source-sha256.txt
```

可选：将本机 `/v3/api-docs` 保存到临时 JSON，再传给文档检查器，核对 47 个运行时 Calendar 路由。检查器不会启动服务、登录或修改数据。

## 已执行结果

- 本次交付审阅使用的后端全量结果：1207 单元/架构 + 84 Testcontainers IT，0 failure/error/skip；包括显式性能例、Modulith、ArchUnit、Spotless、Checkstyle、Enforcer 与 Flyway。
- 前端：28 文件 / 238 测试，格式、lint、TypeScript、构建通过；8 条既有 lint warning 与主 chunk > 500 kB 提示保留。
- 审阅时文档检查：8 份 Markdown、66 个本地链接、47 个 controller/运行时路由与 4 个 Calendar 配置变量通过。可发布索引随后将私人路径改为仓库内测试与此摘要，提交前重新校验。
- 浏览器原生 CSV、owner/scope、启停/撤权、六字段修订、三分支冲突复核与视觉/动效证据记录于 2026-09-02；本次没有把旧截图改标成新运行。

提交前重新执行格式化与全部上述门禁：后端仍为 1207 + 84，0 failure/error/skip；前端仍为 238 通过。可发布文档检查为 9 份 Markdown / 77 个本地链接 / 47 个源码和运行时路由 / 4 个配置变量，通过。此后没有生产或测试源码修改。

提交前这次性能复验 p95：单日 43.15 ms，200 条事件页 45.57 ms，全年范围 76.43 ms，500 条投影 4430.05 ms；既有三个预算断言均通过。原始日志由维护者本地保留，下列指纹不是公开下载链接。

| 原始日志            | SHA-256                                                            |
| ------------------- | ------------------------------------------------------------------ |
| 后端全量 verify     | `6dfa95c5c8198921ebba32b743ceb02c60df8ec888579fa9b014045a1f07949f` |
| 前端 pnpm check     | `8c99baa88f935d42dd430d4694432dcb256b3e249cc58575e048251909ee3fcf` |
| 后端 spotless:apply | `f83b7a29c4a389bf1c9a03ab34990efbbd758b657fa8fe68587562b4dae4f733` |
| 前端 pnpm format    | `9ebdd4ae9f3defb49530087fa6f4f78935ced179f9725e1de468c0d79048e8a5` |

## 性能预算和边界

验收设备：JDK 25.0.4.1+1、PostgreSQL 18.6 aarch64、10 processors、8 GiB heap；8 层、10,000 覆盖、50,000 事件，预热 5、采样 20。

| 场景               | 审阅时 p95 | 预算/结论                        |
| ------------------ | ---------: | -------------------------------- |
| 单日               |   31.34 ms | 300 ms，通过                     |
| 事件页 200 条      |   40.57 ms | 400 ms，通过                     |
| 365 日范围         |   76.21 ms | 仅测量，不设生产 SLA             |
| 500 条同步投影更新 | 4043.35 ms | 本机后台批处理 5000 ms，临时通过 |

同日前一次批次 p95 4880.32 ms，2026-09-02 一次 3190.57 ms；保留波动，不把轮次差异当成性能优化因果实验。预算已编码在 [CalendarPerformanceIT](../../src/test/java/io/apocalypse/CalendarPerformanceIT.java)；默认 CI 不启用此 opt-in 性能例，本机验收命令显式启用。

维护者暂时接受 500 条后台批次预算，数据量级上升再评估。触发条件包括整体作业到千/万级、多写入者并发、交互式即时响应、需要进度/取消/重试、环境或分布变化以及测量回退。届时比较调用端有界分批与队列/作业模型，不自动扩大现有 facade 批次上限。

网络隔离演练未执行；当前依据是本地 CSV 全链路、内置日期/语言资源及零抓取架构检查。维护者在知悉这一边界后接受交付；这不是已经通过隔离断网验证、生产 SLA、容量压测或部署验收。
