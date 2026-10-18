package io.apocalypse.system.authorization.dto.response;

import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

/** 目录定义和代码声明支持能力；没有执行声明的历史身份仅供保留。 */
public record PermissionDefinitionResp(
    Long id,
    String code,
    String name,
    @Schema(nullable = true) String description,
    @Schema(nullable = true) String moduleKey,
    String resource,
    String action,
    Integer status,
    String lifecycle,
    Integer version,
    List<String> supportedScopeOverrides,
    String declarationSource,
    boolean registered,
    Long referenceRoleCount) {}
