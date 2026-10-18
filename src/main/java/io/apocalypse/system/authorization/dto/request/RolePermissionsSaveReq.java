package io.apocalypse.system.authorization.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.util.List;

public record RolePermissionsSaveReq(
    @NotNull @Min(0) Long expectedRevision,
    @NotNull @Min(0) Long expectedCatalogRevision,
    @NotNull @Size(max = 10000) List<@NotNull @Valid PermissionGrantSaveReq> upsert,
    @NotNull @Size(max = 10000) List<@NotNull @Positive Long> remove) {}
