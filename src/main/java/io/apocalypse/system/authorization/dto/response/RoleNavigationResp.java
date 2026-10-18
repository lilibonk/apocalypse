package io.apocalypse.system.authorization.dto.response;

import java.util.List;

public record RoleNavigationResp(Long roleId, Long revision, List<Long> navigationIds) {}
