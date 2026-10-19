package io.apocalypse.system.config.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;

/** 参数配置响应；{@code version} 为乐观锁版本，供客户端提交 expectedVersion。 */
public record ConfigResp(
    Long id,
    String configKey,
    String configName,
    String configValue,
    @Schema(nullable = true) String remark,
    Integer version) {}
