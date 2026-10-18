package io.apocalypse.system.authorization.dto.response;

import java.util.List;

public record RolePermissionsResp(
    Long roleId, Long revision, Long catalogRevision, List<RolePermissionGrantResp> grants) {}
