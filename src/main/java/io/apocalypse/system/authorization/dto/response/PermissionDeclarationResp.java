package io.apocalypse.system.authorization.dto.response;

/** 启动校验所需的无可变实体声明投影。 */
public record PermissionDeclarationResp(String code, String moduleKey, String lifecycle) {}
