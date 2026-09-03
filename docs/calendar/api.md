# API、权限与重试合同

以下是当前 HTTP 实现的路由清单，不是新增契约。后端无 `/api` context-path；浏览器通过反向代理使用 `/api/calendar/...`。具体字段定义见 [请求 DTO](../../src/main/java/io/apocalypse/calendar/interfaces/dto/request) 和 [响应 DTO](../../src/main/java/io/apocalypse/calendar/interfaces/dto/response)。开发/隔离测试环境可用 `/v3/api-docs` / `/swagger-ui.html` 核对路由；生产关闭 swagger。

## 公共规则

- JSON 业务响应为 `R<T> = {code,message,data,traceId,timestamp}`，成功 code=0；Controller 的裸类型会在运行时统一包装。模板/原文件下载是二进制响应，不按 JSON 解包。
- 装箱 Long ID 在 JSON 中是字符串；不要因自动生成 OpenAPI 的 int64 标注就用 JavaScript Number 保存雪花 ID。契约以真实 JSON 与既有 `SnowflakeId` 类型为准。
- Bearer token 必须来自登录/刷新，不将其写入日志或文档。401/40100 由共享客户端最多刷新重放一次；其他错误直接展示后端 R.message（不把用户原文当翻译 key）。
- 分页 `page >= 1`、`1 <= size <= 200`；日期 `from..to` 两端包含，最长 366 天。日期查询可指定 zoneId 和 includePersonal（默认 true）；事件分页按目标日历时区解释日期范围。
- 请求不传可信 owner/userId；私人归属从当前 JWT 派生。成员授权 URL 中 userId 是被授权目标，不是当前操作者。
- 业务操作同时校验全局 `calendar:...` permission 与对象 scope；READER 读已发布内容，EDITOR 维护草稿，PUBLISHER 发布/撤回/管理成员。ROLE_ADMIN 不绕过这些内容边界。
- 查询结果以服务端为真源，前端使用包含 calendarId/范围/版本的 react-query key；写成功或版本错误后回读，不在客户端假装发布成功。

## HTTP 路由

表中完整路径可直接与运行时 OpenAPI 比较。业务工作台需要 EDITOR 或 PUBLISHER；READER 通过日期/可见日程查询读取已发布结果，不读取草稿和内部修订管理列表。

| 方法             | 路径                                                                                 | 用途 / 权限说明                                                          |
| ---------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| GET              | `/calendar/days`                                                                     | 范围 effective day；day:list，需可见日历                                 |
| GET              | `/calendar/days/{date}`                                                              | 单日 effective day；day:read；calendarId 必填                            |
| GET, POST        | `/calendar/calendars`                                                                | 可见日历列表 / 创建；calendar:list / calendar:add；创建受父日历委派限制  |
| GET, PUT         | `/calendar/calendars/{id}`                                                           | 详情 / 更新；calendar:list / calendar:edit；更新需范围 PUBLISHER         |
| POST             | `/calendar/calendars/{id}/archive`                                                   | 归档；calendar:archive + PUBLISHER，不删除数据                           |
| GET              | `/calendar/calendars/{id}/members/page`                                              | 成员页；member:list + PUBLISHER                                          |
| PUT, DELETE      | `/calendar/calendars/{id}/members/{userId}`                                          | 授权/移除；member:edit + PUBLISHER；不能移除最后发布者                   |
| GET              | `/calendar/events/page`                                                              | 本人私人 + 可见的已发布业务日程，不能把业务项当私人项编辑                |
| POST             | `/calendar/events`                                                                   | 创建私人单次日程；event:add                                              |
| GET, PUT, DELETE | `/calendar/events/{id}`                                                              | 本人私人详情/改/删；event:read / event:edit / event:remove               |
| GET              | `/calendar/calendars/{calendarId}/managed-events/page`                               | 托管工作台；managed-event:list + EDITOR 或 PUBLISHER                     |
| POST             | `/calendar/calendars/{calendarId}/managed-events`                                    | 创建草稿；managed-event:edit + EDITOR 或 PUBLISHER                       |
| PUT, DELETE      | `/calendar/calendars/{calendarId}/managed-events/{eventId}/draft`                    | 改/丢弃草稿；managed-event:edit + EDITOR 或 PUBLISHER                    |
| POST             | `/calendar/calendars/{calendarId}/managed-events/{eventId}/publish`                  | 发布；managed-event:publish + PUBLISHER                                  |
| POST             | `/calendar/calendars/{calendarId}/managed-events/{eventId}/withdraw`                 | 撤回当前发布态；managed-event:publish + PUBLISHER                        |
| POST             | `/calendar/calendars/{calendarId}/managed-events/{eventId}/cancel`                   | 取消事件；managed-event:publish + PUBLISHER；终态不得重放复活            |
| GET              | `/calendar/calendars/{calendarId}/personal-overrides`                                | 本人当前修订；personal-override:list；from/to 必填                       |
| PUT              | `/calendar/calendars/{calendarId}/personal-overrides/{date}`                         | 本人六字段变更；personal-override:edit                                   |
| GET              | `/calendar/calendars/{calendarId}/personal-override-conflicts/page`                  | 本人待复核/历史；personal-override:list                                  |
| POST             | `/calendar/calendars/{calendarId}/personal-override-conflicts/{conflictId}/resolve`  | KEEP/REBASE/INHERIT；personal-override:edit                              |
| GET              | `/calendar/calendars/{calendarId}/managed-overrides/revisions/page`                  | 业务覆盖修订；managed-override:list + EDITOR 或 PUBLISHER                |
| GET, DELETE      | `/calendar/calendars/{calendarId}/managed-overrides/draft`                           | 查询 / 丢弃草稿；读取需草稿可见角色，写需 managed-override:edit          |
| PUT              | `/calendar/calendars/{calendarId}/managed-overrides/draft/days/{date}`               | 六字段草稿；managed-override:edit + EDITOR 或 PUBLISHER                  |
| POST             | `/calendar/calendars/{calendarId}/managed-overrides/draft/publish`                   | 带差异与冲突决定发布；managed-override:publish + PUBLISHER               |
| POST             | `/calendar/calendars/{calendarId}/managed-overrides/revisions/{revisionId}/withdraw` | 撤回业务修订；managed-override:publish + PUBLISHER                       |
| GET              | `/calendar/calendars/{calendarId}/managed-override-conflicts/page`                   | 业务冲突；managed-override:list + EDITOR 或 PUBLISHER；决定随发布提交    |
| GET              | `/calendar/calendars/{calendarId}/projection-grants`                                 | 来源授权列表；projection-grant:list + PUBLISHER                          |
| PUT, DELETE      | `/calendar/calendars/{calendarId}/projection-grants/{sourceSystem}`                  | 授权/停用来源；projection-grant:edit + PUBLISHER                         |
| GET              | `/calendar/data-imports/template`                                                    | CSV 模板；data-import:list；targetType/year 必填                         |
| GET              | `/calendar/data-imports/page`                                                        | 可见导入分页；data-import:list                                           |
| POST             | `/calendar/data-imports`                                                             | multipart 上传；data-import:upload；MANAGED 另需范围 EDITOR 或 PUBLISHER |
| GET              | `/calendar/data-imports/{id}`                                                        | 导入详情、版本/hash；data-import:list                                    |
| GET              | `/calendar/data-imports/{id}/diff`                                                   | 差异；data-import:list                                                   |
| GET              | `/calendar/data-imports/{id}/files/data`                                             | 原 CSV 下载；data-import:list，MANAGED 需范围授权                        |
| GET              | `/calendar/data-imports/{id}/files/evidence`                                         | 原证据下载；data-import:list；无附件返回不存在                           |
| POST             | `/calendar/data-imports/{id}/validate`                                               | 校验 UPLOADED；data-import:upload                                        |
| POST             | `/calendar/data-imports/{id}/review`                                                 | 审核 VALIDATED；data-import:publish；MANAGED 需 PUBLISHER                |
| POST             | `/calendar/data-imports/{id}/publish`                                                | 发布 REVIEWED；data-import:publish；MANAGED 需 PUBLISHER                 |
| POST             | `/calendar/data-imports/{id}/reject`                                                 | 拒绝未发布导入；data-import:publish；不能拒绝已发布态                    |

上表权限短名均以 `calendar:` 为前缀；SYSTEM 导入由 data-import 权限控制，发放发布权需独立审阅，不能与普通托管日历成员权混为一谈。

## 时间、覆盖与版本

- 全天：`timeKind=ALL_DAY`，startDate / endDateExclusive 是 LocalDate，结束日期不包含，不随查看者时区漂移；不同时提交定时字段。
- 定时 HTTP：`timeKind=TIMED`，startLocal/endLocal 与 IANA zoneId；遇到重叠时刻显式指定 startOffsetChoice/endOffsetChoice 为 EARLIER 或 LATER，空档拒绝。结束必须晚于开始；内部存 UTC 时间点并保留 TZID。
- 标题 1–200、description ≤ 2000、location ≤ 256。详情来源为 PROJECTION 的托管事件不能用普通 UI/API 改写来源内容。
- 六字段保存用 `expectedRevisionNo` + operations，单命令最多 200 项；同日字段不重复，发布快照最多 10,000 项。SET 对应 value 槽位：lunarDate / zodiac / solarTerm / dayPolicy / text；CLEAR/INHERIT 不携 value。
- 托管事件发布：expectedDraftVersion + expectedContentHash；业务覆盖发布额外带 conflictResolutions。成员/日历更新按返回的当前 version 构造 expectedVersion，不始终提交 0。
- 个人冲突决定使用当前 expectedRevisionNo；托管冲突决定随待发布草稿提交。KEEP 不丢意图，REBASE 接受新下层比较值，INHERIT 恢复新下层；具体流程见 [SOP](data-update-sop.md)。
- **HTTP 发布的一次效果不等于成功响应重放**：同一草稿消费后重试可返回 11006；导入已发布重试可返回 11018。遇到超时先查询当前 revision/import 状态，不盲目重建第二次发布或伪造新 hash。

## 上游投影 facade

唯一跨模块入口是 [CalendarProjectionApi](../../src/main/java/io/apocalypse/calendar/api/CalendarProjectionApi.java) 的 `upsert(ProjectionBatchCommand)` / `cancel(CancelProjectionBatchCommand)`；不是对外 HTTP 批处理端点，不允许通过外部 DB/Redis 写入替代它。

- sourceSystem + sourceType + sourceKey 唯一标识来源事件；targetCalendarKey 必须获有效 grant，投影来源不能跨目标抢占已绑定事件。
- sourceVersion 单调；同版本同内容返回 UNCHANGED，同版本异内容 11010，旧版本 STALE；新版本更新。结果状态为 CREATED / UPDATED / UNCHANGED / STALE / CANCELLED，顺序对应输入。
- 一批 1–500，批内原子；失败无部分写入。千/万级需调用方有界分批，并明确它们不是跨批事务；当前未实现作业平台/进度/取消管理。
- `DRAFT_ONLY` 只更新草稿，已发布的 Campus 快照在下次人工发布前保持；`DIRECT_PUBLISH` 才即时发布。停止来源授权不删除已发布历史，之后 facade 调用会失败。
- 投影定时内容传 `Instant` 的 startInstant/endInstant 与 zoneId，DST 由上游先解析；HTTP 私人/托管表单则采用本地时间 + offsetChoice，两种合同不要混用。
- 当前后台 500 条更新本机 p95 ≤ 5 秒为临时验收预算，详见 [验证记录](verification.md#性能预算和边界)。并发正确性测试不是并发容量测试。

## 稳定错误处理

| code                          | 含义 / 处置                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------- |
| 40100 / 40300                 | 未认证/无权；刷新或申请正确范围权限，不绕过 owner                                                 |
| 40400                         | 不存在或关闭暴露面；核对 capability、对象与可见性                                                 |
| 40900                         | 版本/hash/并发冲突时重新读取并再次确认；若 message 为“日历导入存储配额不足”，转容量处置，不盲重试 |
| 42900                         | 请求限流；按错误信息处理，不连续重试上传                                                          |
| 11000                         | Calendar facade 禁用                                                                              |
| 11001 / 11002                 | 无效层级/超深；调整父级和子树，不能移动后代造成超限                                               |
| 11003 / 11004 / 11005         | 无效 TZID / DST 空档 / DST 歧义                                                                   |
| 11006                         | 修订状态不允许当前动作；先查询是否已发布/撤回                                                     |
| 11007 / 11008                 | 覆盖值不合法 / 存在待复核冲突                                                                     |
| 11009 / 11010 / 11011         | 来源未授权 / 同版本异内容 / 批量超限                                                              |
| 11012 / 11013 / 11014         | 时间范围无效 / 最后 publisher / 投影来源专属内容                                                  |
| 11015                         | 基线不可用；停止相信日期结果，检查版本/资源完整性                                                 |
| 11016 / 11017 / 11018 / 11019 | 文件格式 / 官方来源证据 / 导入状态 / 导入目标范围错误                                             |

完整枚举以 [CalendarErrorCode](../../src/main/java/io/apocalypse/calendar/api/CalendarErrorCode.java) 与公共 [ErrorCode](../../src/main/java/io/apocalypse/common/response/ErrorCode.java) 为准。保留 traceId 供诊断，不在日志里打印 token 或私人正文。
