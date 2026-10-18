package io.apocalypse.system.authorization.dto.request;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.util.List;

public record RoleNavigationSaveReq(
    @NotNull @Min(0) Long expectedRevision,
    @NotNull @Size(max = 10000) List<@NotNull @Positive Long> addIds,
    @NotNull @Size(max = 10000) List<@NotNull @Positive Long> removeIds) {}
