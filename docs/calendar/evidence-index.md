# Calendar v1 · 交付证据索引

OPC：`OPC-20260830-calendar-v1`；审阅日期：2026-09-03。维护者已接受当前交付及下述验证边界，授权 commit、push 和专用 QA 数据清理。PR、合并、release、部署和个人 Obsidian/原始 QA 公示不在本次授权内。

此索引是可随代码交付的摘要。原始日志、浏览器截图/DOM、内部决定和清理备份保留在维护者本地，不作为仓库公共内容；它们没有被删除，也没有以本地路径伪装成可公开访问的证据。关联任务为 [LIL-27](https://linear.app/lilibonk/issue/LIL-27/完成-calendar-v1-交付评审与-github-gate)，访问需相应 Linear 权限。

## 构建与验证

- [验证记录、性能预算与已知限制](verification.md)：实际执行命令、测试计数、环境和原始日志指纹。
- [源码与配置指纹](evidence/source-sha256.txt)：路径相对仓库根；不包含此索引或自身。提交版本以 Git commit 为准，指纹用来绑定已验证的源码/配置，不是生产备份。
- [文档检查器](verify-docs.mjs)：检查本地链接、controller 路由与文档双向覆盖、环境变量、错误码和 CSV 表头；可传入本机 `/v3/api-docs` 导出的 JSON 核对运行时路由。不访问网络或写业务数据，不是新增 CI 门禁。

## 成功指标 → 直接证明

PASS 只表示声明的测试范围通过，不是全部时间/时区/设备的穷举或生产 SLA。

| 指标              | 可执行证据                                                                                                                                                                                                                                                                                                                   | 结论与边界                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 模块边界          | [Modulith](../../src/test/java/io/apocalypse/ModuleBoundaryTest.java)、[ArchUnit](../../src/test/java/io/apocalypse/LayeringRulesTest.java)                                                                                                                                                                                  | PASS，Calendar 内部依赖/第三方适配层受约束                            |
| 禁用/再启用       | [关闭](../../src/test/java/io/apocalypse/CalendarSchemaIT.java)、[facade](../../src/test/java/io/apocalypse/calendar/application/GuardedCalendarProjectionApiTest.java)、[前端 capability](../../apocalypse-web/src/routes/menu-capabilities.test.ts)、[菜单访问](../../apocalypse-web/src/routes/menu-access.test.ts)       | PASS；浏览器关闭与恢复、数据保留已验证                                |
| 私人隔离          | [API IT](../../src/test/java/io/apocalypse/CalendarCapabilityEnabledIT.java)、[修订并发](../../src/test/java/io/apocalypse/CalendarRevisionConcurrencyIT.java)                                                                                                                                                               | PASS，admin 不自动穿透 owner                                          |
| 托管权限/发布     | [生命周期 IT](../../src/test/java/io/apocalypse/CalendarCapabilityEnabledIT.java)、[审计](../../src/test/java/io/apocalypse/CalendarAuditIT.java)、[前端范围](../../apocalypse-web/src/views/calendar/management-scope.test.tsx)                                                                                             | PASS；浏览器发布/撤回/取消已验证                                      |
| 日期准确/范围     | [农历 fixture](../../src/test/java/io/apocalypse/calendar/infrastructure/date/LunarDateKnowledgeProviderTest.java)、[年度政策](../../src/test/java/io/apocalypse/calendar/infrastructure/date/ClasspathHolidayPolicyProviderTest.java)、[资源来源](../../src/main/resources/calendar/baseline/cn-holidays-2025-2026-r1.json) | PASS 于声明 fixture/支持范围，非全部日期人工重核                      |
| 内网年度更新      | [业务导入](../../src/test/java/io/apocalypse/CalendarDataImportIT.java)、[系统导入](../../src/test/java/io/apocalypse/CalendarSystemDataImportIT.java)                                                                                                                                                                       | 本地文件全链路 PASS；未执行网络隔离演练，该验证边界已随交付披露并接受 |
| 来源不冒充        | [系统来源约束](../../src/test/java/io/apocalypse/CalendarSystemDataImportIT.java)、[SOP](data-update-sop.md)                                                                                                                                                                                                                 | PASS，无法证明官方来源的表格仅作为业务 LOCAL_POLICY                   |
| 有效值解析        | [真值表](../../src/test/java/io/apocalypse/calendar/domain/DayFieldResolverTruthTableTest.java)、[继承 IT](../../src/test/java/io/apocalypse/CalendarHierarchyIT.java)                                                                                                                                                       | PASS，1152 组合 + 6 基线/KEEP 边界                                    |
| 用户覆盖优先      | [优先级 IT](../../src/test/java/io/apocalypse/CalendarCapabilityEnabledIT.java)、[六字段模型](../../apocalypse-web/src/views/calendar/day-override-model.test.tsx)                                                                                                                                                           | PASS，优先但不越权，基线不被覆盖写入                                  |
| 覆盖可逆/历史     | [修订 IT](../../src/test/java/io/apocalypse/CalendarRevisionConcurrencyIT.java)、[历史差异 UI](../../apocalypse-web/src/views/calendar/override-revision-diff.test.tsx)                                                                                                                                                      | PASS，以新修订/恢复继承处理，不改历史                                 |
| 基线升级安全      | [真值表](../../src/test/java/io/apocalypse/calendar/domain/DayFieldResolverTruthTableTest.java)、[API IT](../../src/test/java/io/apocalypse/CalendarCapabilityEnabledIT.java)                                                                                                                                                | PASS；浏览器 KEEP/REBASE/INHERIT 三路径与来源回读                     |
| 时间稳定          | [时间规范化](../../src/test/java/io/apocalypse/calendar/application/EventContentNormalizerTest.java)、[前端时区](../../apocalypse-web/src/views/calendar/calendar.format.test.ts)                                                                                                                                            | PASS，全天与上海/DST 指定场景，非所有时区穷举                         |
| 投影幂等/校园模拟 | [投影并发 IT](../../src/test/java/io/apocalypse/CalendarProjectionConcurrencyIT.java)、[facade IT](../../src/test/java/io/apocalypse/CalendarCapabilityEnabledIT.java)                                                                                                                                                       | PASS，调课/重放/旧版本/取消/整批失败，非并发容量测试                  |
| 前端体验          | [月历](../../apocalypse-web/src/views/calendar/index.test.tsx)、[范围](../../apocalypse-web/src/views/calendar/management-scope.test.tsx)、[覆盖](../../apocalypse-web/src/views/calendar/day-override-model.test.tsx)                                                                                                       | 自动测试与已记录桌面/移动、明暗、动效/焦点 QA 通过，非完整 WCAG 认证  |
| 全量门禁          | [验证记录](verification.md)、[现有 CI](../../.github/workflows/ci.yml)                                                                                                                                                                                                                                                       | 本地后端/前端通过；远端实际是否执行以 checks 为准                     |

## 文档交付

| 接受条件                             | 交付物                                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| 能力、默认关闭、非目标、快速验证     | [入口](README.md)、[根 README](../../README.md)、[前端 README](../../apocalypse-web/README.md) |
| 配置、重启、多实例、会话、兼容       | [配置](configuration.md)                                                                       |
| 来源、年度更新、离线表格、纠错、许可 | [SOP](data-update-sop.md)、[许可清单](../../THIRD_PARTY_NOTICES.md)                            |
| HTTP/facade/范围角色/错误/批量/幂等  | [API](api.md)                                                                                  |
| Flyway、回滚、保留/清理、权限/恢复   | [运维策略](operations-and-retention.md)                                                        |

## 接受不等于上线

本次接受的是 Calendar v1 代码与文档交付及其已披露限制。500 条后台批次本机预算是临时接受；规模上升、调用者并发增加或环境变化须重新评估。真正网络隔离、生产容量/SLA、排课算法、部署与发布不是当前已完成的验证或产品承诺。

后续若要求严格断网的可重放演练，沿用 LIL-25 验证范围补验；不把维护者接受当前交付写成已经实施了该演练。历史开发库的 V1 checksum 不一致仍须独立处理，不属于 QA 清理。
