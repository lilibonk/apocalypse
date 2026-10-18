package io.apocalypse.system.authorization.dto.response;

import java.time.Instant;

import io.swagger.v3.oas.annotations.media.Schema;

public record RolePermissionGrantResp(
    Long permissionId,
    boolean enabled,
    String scopeOverride,
    @Schema(nullable = true) Instant validFrom,
    @Schema(nullable = true) Instant validUntil,
    @Schema(nullable = true) PermissionDefinitionResp definition) {}
