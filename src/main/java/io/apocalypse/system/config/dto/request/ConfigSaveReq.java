package io.apocalypse.system.config.dto.request;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import io.swagger.v3.oas.annotations.media.Schema;

/** 参数配置保存请求（创建/更新共用）。更新时 {@code expectedVersion} 可选：提供时按读取时的版本做乐观锁校验， 过期返回 40900；为空保持旧客户端行为。 */
public record ConfigSaveReq(
    @NotBlank(message = "参数键不能为空") @Size(max = 64, message = "参数键最长 64 字符") String configKey,
    @NotBlank(message = "参数名称不能为空") @Size(max = 64, message = "参数名称最长 64 字符") String configName,
    @Size(max = 512, message = "参数值最长 512 字符") String configValue,
    @Size(max = 255, message = "备注最长 255 字符") String remark,
    @Schema(nullable = true) @Min(value = 0, message = "版本号无效") Integer expectedVersion) {}
