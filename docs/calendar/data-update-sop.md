# 离线数据更新与纠错 SOP

## 先选择正确的数据层

| 需求                                         | 使用入口                                  | 不能做什么                         |
| -------------------------------------------- | ----------------------------------------- | ---------------------------------- |
| 已核验的年度法定节假日/调休                  | `SYSTEM_BASELINE` 年度 CSV + 官方来源审阅 | 不把业务安排冒充全国法定事实       |
| 学校/园区/公司的自定义日别                   | `MANAGED_OVERRIDE` / `LOCAL_POLICY`       | 不修改其他日历或所有用户的系统基线 |
| 农历、生肖、节气、标签、备注或日别的业务纠偏 | 业务日期覆盖页六字段编辑，publisher 发布  | CSV 不是六字段导入器               |
| 仅本人视图的修正                             | 个人日期覆盖页                            | 平台 admin 也不能替他人越权修改    |

原生 XLSX/XLS/ODS 不受支持。外部表格先由持有人导出为本 SOP 的 UTF-8 CSV，核对日期格式和列顺序；不要只修改扩展名。CSV 不执行公式；业务文本原样展示，下载到外部电子表格软件时应按文本查看，不启用外部内容/公式。

## 1. 收集与核验来源（可在网外完成）

- 官方通知可由有网络的人员获取后，经受控渠道把 CSV 与 PDF/PNG/JPEG/CSV 证据带入内网。业务服务本身不访问 sourceUri，不联网搜索或验证政府站点。
- 保存文号、标题、发布机关、发布日期、来源定位、原文件、获取/转交记录和人工逐项核对依据；hash 证明字节一致，不证明内容真实。
- `OFFICIAL_NOTICE` 必须有上述文书元数据，assuranceLevel 使用实际核验方式 `ONLINE_VERIFIED` 或 `OFFLINE_DOCUMENT_REVIEWED`；`UNVERIFIED` 不允许进入 SYSTEM。
- 只有一份不能证明官方来源的表格：选择具体业务日历、`LOCAL_POLICY` / `UNVERIFIED`，使用自定义日别。缺少政府网络不阻断此业务路径，系统未发布状态则继续明确展示。
- 当前代码允许 evidenceFile 缺省，来源保证依赖元数据与人工 sourceAttested；**没有自动真实性鉴定，也没有强制双人审批**。需要四眼原则的组织应把独立复核记录纳入自己的审批流程，不虚称系统已强制执行。

当前随包资源的来源清单保存在 [cn-holidays-2025-2026-r1.json](../../src/main/resources/calendar/baseline/cn-holidays-2025-2026-r1.json) 的 `sources`。它声明 2025/2026 两份国务院办公厅通知；本 SOP 复用仓库已审阅来源，不声称本轮重新核验了政府文件。日期依赖/许可见 [THIRD_PARTY_NOTICES](../../THIRD_PARTY_NOTICES.md)；实际依赖版本由 [pom.xml](../../pom.xml) 与 Spring Boot BOM 决定。

## 2. 下载模板并准备数据

年度导入页下载模板，或调用：

`GET /calendar/data-imports/template?targetType=MANAGED_OVERRIDE&year=2027`

模板里的元旦行是示例，不能未经核对直接当作年度事实。固定列顺序：

```csv
date,action,classification,name,source_document_no,note
2027-09-01,SET,CUSTOM_WORKDAY,迎新工作日,,仅本校适用
```

- 文件 1 byte–2 MiB，严格 UTF-8（可带 BOM），最多 366 个数据行、至少一条；日期必须在 metadata.dataYear（1901–2100）内，同一天不能重复。引号/逗号/换行遵循当前 Commons CSV RFC4180 parser。
- `SYSTEM_BASELINE`：每行只能 SET，classification 为 OFFICIAL_REST 或 ADJUSTED_WORKDAY，每行 source_document_no 与元数据文号一致。应提交核验后的**完整年度特殊日别集合**，不是增量补丁；普通周末/工作日由基线计算。
- `MANAGED_OVERRIDE`：SET 只能 CUSTOM_REST / CUSTOM_WORKDAY；CLEAR 或 INHERIT 的 classification/name 必须为空。只改 CSV 出现的日期政策，保留其他日期和其他字段已有覆盖；要恢复某天必须显式写 INHERIT，不能假设省略等于删除。
- name ≤ 64、note ≤ 500 字符。CSV note 是导入证据说明，**不等于 DISPLAY_NOTE 覆盖字段**。
- 一个可选 evidenceFile ≤ 20 MiB；支持 pdf/png/jpg/jpeg/csv，检查扩展名与部分文件签名，拒绝 ZIP/Office 容器。签名检查不是完整恶意文件扫描，遵守组织附件处理制度。

## 3. 上传 → 校验 → 差异 → 审核 → 发布

1. 选择目标与年份，使用新的 importKey（字母/数字开头，允许字母数字 `._:-`，最多 64）；MANAGED 必填有权管理的 targetCalendarId，SYSTEM 不能传该字段。
2. 上传 multipart：`metadata` 是 JSON，`dataFile` 是 CSV，`evidenceFile` 可选。记录导入 ID、版本、原始字节 hash；原文件进入 `cal_data_import`，不只停留于临时文件。
3. 校验得到 VALIDATED 或 INVALID。错误逐行/逐列展示；INVALID 不直接覆写原文件，修正后以新 importKey 重新上传，旧记录保留作追溯。
4. 打开 diff，核对新增/修改/恢复继承/未变项、目标 contentHash 及已有覆盖冲突。SYSTEM 导入会重建该年份校正集合，必须人工核对完整年度清单；不可仅凭“文件里几行 diff”就认定遗漏日期没有影响。
5. 审核需要 `sourceAttested=true`、最新 expectedVersion、原文件 hash、规范化 payload hash 和审阅说明。MANAGED 由当前日历 PUBLISHER 审核；SYSTEM 依赖独立的 data-import 发布权限，发放该权限意味着系统层数据发布责任。
6. 发布提交审核时的 expectedVersion、normalizedPayloadHash、targetContentHash。目标/hash 改变时拒绝，不自动批准新差异；重新查询，必要时拒绝旧导入并用新键重新提交。
7. 发布后回读目标日期，核对实际 effective value、baselineRelease/业务 revision、字段来源；再次查看有个人覆盖的日期，确认其值继续优先，底层变化显示待复核。

MANAGED 发布遇到已有草稿或未复核冲突时先在业务覆盖工作台处理，不擅自丢弃别人的草稿。上传者与发布者还必须同时满足全局接口权限和具体日历角色。发布失败不能靠手改 state/hash 继续。

## 4. 纠错与恢复

- 年度日别错误：保留旧导入/审核/发布记录，使用新 importKey、新审核和新发布修订纠正。SYSTEM 的全年集合重新核对；MANAGED 可显式 INHERIT 恢复下层。
- 农历/节气等字段的本地业务错误：使用六字段个人或业务覆盖，确认范围与来源后发布；不必等待外部算法更新，也不修改系统原始数据。
- 若要修改所有用户共用的非日别系统算法/基线：当前 CSV 接口不支持此类导入；必须走受控 provider/数据版本更新、fixture 验证和对应审批，不提供直接改库入口。
- 业务覆盖错误：撤回错误修订，必要时以历史正确内容建立**新的单调版本**，重新预览和发布；不要复用已消费草稿的版本号/hash。私人修改用 INHERIT 或新修订恢复。
- 下层变化待复核：KEEP 保留当前意图及原比较基线；REBASE 保留值但接受新比较基线；INHERIT 恢复新的下层值。每次选择先核对差异与范围，之后回读来源；KEEP 不是以后所有基线变化永久免审。

## 5. 必须留存的记录

原 CSV/附件及 hash、元数据、校验器版本、normalizedPayloadHash、diff、sourceAttested/审阅人时间、发布人时间、目标 hash 与 release/revision 引用；另外保留完整来源清单与相关用户覆盖/冲突历史。通用操作日志只保留标识/动作/版本/结果，不承担保存业务原文或官方通知正文的责任。

保留周期、备份与清理权限见 [运维与保留策略](operations-and-retention.md)。本 SOP 不授权发布真实年度数据或清理旧记录。
