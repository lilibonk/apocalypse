package io.apocalypse.system.authorization.dto.response;

/** 只有实际授予当前操作的有效角色参与范围合并。 */
public record RoleScopeGrantResp(String dataScope, String moduleKey) {}
