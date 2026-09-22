package io.apocalypse.system.config.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;

/** 参数配置响应。 */
public record ConfigResp(
    Long id,
    String configKey,
    String configName,
    String configValue,
    @Schema(nullable = true) String remark) {}
