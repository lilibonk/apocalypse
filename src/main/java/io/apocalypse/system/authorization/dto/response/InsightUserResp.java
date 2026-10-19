package io.apocalypse.system.authorization.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;

/** 洞察中的用户摘要；只返回调用者 {@code system:user:list} 数据范围内可见的用户。 */
public record InsightUserResp(Long id, String username, @Schema(nullable = true) String nickname) {}
