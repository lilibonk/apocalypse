package io.apocalypse.system.config.dto.request;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** 批量保存中的单项参数值；{@code expectedVersion} 为客户端读取该行时的版本。 */
public record ConfigValueItemReq(
    @NotNull(message = "参数 ID 不能为空") Long id,
    @NotNull(message = "版本号不能为空") @Min(value = 0, message = "版本号无效") Integer expectedVersion,
    @Size(max = 512, message = "参数值最长 512 字符") String configValue) {}
