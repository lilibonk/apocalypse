package io.apocalypse.system.authorization.dto.response;

import java.time.Instant;

/** 完整持久化关联投影，不按候选目录、状态或时间过滤。 */
public record StoredPermissionGrantResp(
    Long permissionId,
    boolean enabled,
    String scopeOverride,
    Instant validFrom,
    Instant validUntil) {}
