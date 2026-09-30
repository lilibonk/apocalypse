# 审计事件故障恢复

登录成功、登录失败和操作日志通过 Spring Modulith 持久化事件落库。短暂写库失败会保留 `event_publication` 记录，并由内置恢复轮询重试；`sys_login_log` 和 `sys_oper_log` 的 `event_id` 唯一约束使重复投递最终只产生一条日志。

这项能力用于恢复三类审计事件，不是在线任务管理平台。其他业务事件、Calendar 可选能力和 Order 历史兼容事件不由此任务重投。正常发布、完成及清理行为仍使用已安装的 Modulith JDBC 仓库。实现针对本发行固定的 Modulith 2.1.0、PostgreSQL 和 Flyway 管理的默认 `event_publication` 表。

## 默认恢复边界

| 配置 `apocalypse.events.recovery.*` | 默认值 | 含义 |
| --- | --- | --- |
| `enabled` | `true` | 是否启用；可用 `APOCALYPSE_EVENTS_RECOVERY_ENABLED=false` 关闭 |
| `initial-delay` / `delay` | `PT30S` / `PT30S` | 启动等待 / 两轮间隔 |
| `batch-size` | `50` | 每轮最多领取的记录数；范围 1–500 |
| `max-in-flight` | `100` | 按当前待处理审计记录计算的恢复投递余量；范围 batch-size–1000 |
| `max-attempts` | `5` | 包含初次消费的自动尝试预算；范围 1–20 |
| `initial-backoff` | `1m` | 初次失败后等待 |
| `max-backoff` | `15m` | 指数退避上限 |
| `stale-after` | `10m` | 最近发布/重投后仍未结束的审计记录视为中断 |

退避按最近一次重投时间计算：默认为 1、2、4、8 分钟；轮询间隔会增加实际等待时间。调高尝试预算后退避仍封顶 15 分钟。持续失败达到预算后，记录保留为失败，不再自动投递；重启不会重置预算。参数修改重启生效。

次数、退避和事件类型都在 SQL `LIMIT` **之前**筛选。超过一批的耗尽记录、尚在退避的记录不会一直占住队头。每轮陈旧状态回收也有批次上限。无法反序列化的已知审计 payload 原样保留并立即停止自动重试，日志仅输出 publication UUID 和错误类型。

多实例通过 PostgreSQL 会话 advisory 锁 `(20260927, 149)` 协调恢复批次；锁不可得直接跳过。协调连接持锁，领取更新各自立即提交，避免 Modulith 同步失败处理等待自己的未提交行锁。任务退出时显式解锁，解锁失败则丢弃物理连接。进程退出/连接终止后 PG 自动释放锁，下一实例继续读取数据库预算。运行连接池需至少能同时提供一个协调连接和一个工作连接。

`stale-after` 应大于正常审计消费最长耗时。超慢消费者和中断恢复之间仍可能发生重复调用，最终唯一性依靠数据库幂等写入。`max-in-flight` 控制恢复余量，不限制业务本身新产生的审计事件速率。

## 观测与告警

在已有、受访问控制保护的 Micrometer/Actuator 指标入口观察：

| 指标 | 说明 |
| --- | --- |
| `apocalypse.audit.recovery.pending` | 三类未完成审计记录总数 |
| `apocalypse.audit.recovery.in.flight` | PUBLISHED / PROCESSING / RESUBMITTED 数量 |
| `apocalypse.audit.recovery.exhausted` | 达到预算、需要人工处理的失败记录 |
| `apocalypse.audit.recovery.oldest.seconds` | 最早未完成审计记录的年龄 |
| `apocalypse.audit.recovery.last.success.epoch.seconds` | 此实例最后成功执行并采样的时间；启动后初始为 0 |
| `apocalypse.audit.recovery.runs{outcome}` | completed / lock_skipped / failed 次数 |
| `apocalypse.audit.recovery.resubmitted` | 此实例实际成功领取的恢复投递数 |

Gauge 是成功轮询后的缓存快照。锁未获、数据库不可用或关闭恢复时，不应把旧值理解为当前无积压；必须同时检查最近采样时间。多实例观测应结合所有实例，单个长期未获锁的实例可能保留旧快照。`exhausted > 0` 应触发人工处理；pending、最早年龄持续增加或所有实例的成功采样时间不前进，应检查数据库连接、审计目标表、日志错误类型和实例调度状态。

以下只查询元数据，不输出事件 payload：

```sql
SELECT id, event_type, listener_id, status,
       COALESCE(completion_attempts, 1) AS completion_attempts,
       publication_date, last_resubmission_date
FROM event_publication
WHERE completion_date IS NULL
  AND event_type IN (
    'io.apocalypse.common.event.LoginSucceededEvent',
    'io.apocalypse.common.event.LoginFailedEvent',
    'io.apocalypse.common.event.OperLoggedEvent'
  )
ORDER BY publication_date, id
LIMIT 100;
```

publication UUID 是投递登记 ID，与 payload 内的审计 `eventId` 不同。事件内容可能包含经过脱敏的操作参数和账号信息，只有确需排障时才在受控环境查看；不要复制到公开 Issue、日志或发布附件。

## 处理耗尽记录

1. 确认告警与 publication UUID，保存当前状态、尝试次数及处理原因到受控运维记录。先修复目标表权限/容量、消费者故障或配置根因。临时数据库故障通常可由尚未耗尽的自动预算处理。
2. 暂停所有应用实例的恢复任务（将 `APOCALYPSE_EVENTS_RECOVERY_ENABLED=false` 后滚动重启），确认没有正在执行的恢复。不要启用全量重启重投。
3. 对**一个已审核 UUID**重新授予一次尝试。示例使用 psql 变量，`max_attempts` 必须匹配当前配置。事务 advisory 锁与运行时会话锁互斥，保护这次人工更新；查询将行保持 FAILED、保留原 payload，并重新开始退避等待。

```sql
\set publication_id '00000000-0000-0000-0000-000000000000'
\set max_attempts 5

BEGIN;
SELECT pg_advisory_xact_lock(20260927, 149);
UPDATE event_publication
SET completion_attempts = :max_attempts - 1,
    status = 'FAILED',
    last_resubmission_date = now()
WHERE id = :'publication_id'::uuid
  AND completion_date IS NULL
  AND (status = 'FAILED' OR status IS NULL)
  AND COALESCE(completion_attempts, 1) >= :max_attempts
  AND event_type IN (
    'io.apocalypse.common.event.LoginSucceededEvent',
    'io.apocalypse.common.event.LoginFailedEvent',
    'io.apocalypse.common.event.OperLoggedEvent'
  )
RETURNING id, status, completion_attempts;
COMMIT;
```

4. 预期只返回一条；零条时重新核对状态，不能放宽为全表更新。恢复原配置，等待一次受退避控制的重试；检查原 publication 完成、目标审计行唯一、耗尽计数下降。默认重新授予最后一次尝试后等待 8 分钟左右再投递。
5. 仍失败则停止并升级人工处理。损坏 payload 或已移除 listener 不能靠重置次数修复；必须保留原始证据、先修复兼容消费方式再重试。不要直接删除失败记录、改写 payload 或伪造 completion_date。

人工重新授予预算会修改现有尝试计数，因此必须在受控操作记录保留修改前后值；该字段不是永久不可变的历史计数。已完成登记仍按 `apocalypse.events.completed-retention-days` 清理，审计业务日志按独立保留周期清理；失败或耗尽登记不自动删除，需要监控磁盘和备份体积。

## 支持与回退边界

必须保持 JDBC V2、默认事件表和 `UPDATE` 完成模式。启用审计恢复时，配置旧表结构、自定义事件 Schema、其他完成模式或无界重启重投会明确启动失败。不要同时配置 Modulith 的全局陈旧重投任务来代替这项审计策略。

关闭本功能后，原有发布/完成/清理继续工作，所有未完成记录和预算仍保留。恢复后重新开启会继续现有状态；不要通过清表“回退”。没有新增 Schema 或业务事件字段，因此无需反向数据库迁移。

升级 Modulith、更改事件表/监听器签名、加入新的可选业务事件或支持其他数据库之前，重新核对仓库扩展接口及恢复策略。自动恢复白名单不能未经评估扩大为全部业务事件。
