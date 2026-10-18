package io.apocalypse.system.authorization.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;

import java.time.Instant;

public record PermissionGrantSaveReq(
    @NotNull @Positive Long permissionId,
    @NotNull Boolean enabled,
    @NotBlank @Pattern(regexp = "INHERIT_ROLE|ALL|DEPT|DEPT_AND_CHILDREN") String scopeOverride,
    Instant validFrom,
    Instant validUntil) {}
