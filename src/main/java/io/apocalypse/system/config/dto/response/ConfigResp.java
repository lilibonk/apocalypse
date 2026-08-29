package io.apocalypse.system.config.dto.response;

/** 参数配置响应。 */
public record ConfigResp(
    Long id, String configKey, String configName, String configValue, String remark) {}
