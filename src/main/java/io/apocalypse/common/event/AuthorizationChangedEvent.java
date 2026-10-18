package io.apocalypse.common.event;

import java.time.LocalDateTime;
import java.util.UUID;

/** 授权配置完整变更事件；原事务可靠记录，不截断配置，不含密码或令牌。 */
public record AuthorizationChangedEvent(
    UUID eventId,
    LocalDateTime occurredAt,
    Long actorId,
    String subjectType,
    Long subjectId,
    Long beforeRevision,
    Long afterRevision,
    String beforeConfiguration,
    String afterConfiguration,
    String diffHash,
    String requestId) {}
