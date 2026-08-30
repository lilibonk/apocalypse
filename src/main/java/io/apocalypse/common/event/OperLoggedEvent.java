package io.apocalypse.common.event;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 操作日志事件（framework.log 的 {@code @OperLog} 切面发布、system 落库 sys_oper_log）。 字段对齐 sys_oper_log 列（除
 * id/oper_time：主键应用层生成、操作时间由消费方落库时记）。
 *
 * @param operParam 请求参数 JSON（敏感值已脱敏为 ***）
 * @param status 1=成功 0=失败
 */
public record OperLoggedEvent(
    UUID eventId,
    LocalDateTime occurredAt,
    String title,
    String businessType,
    String method,
    String operName,
    String operIp,
    String operParam,
    String operResult,
    Integer status,
    String errorMsg,
    Long costTime) {}
