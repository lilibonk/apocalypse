package io.apocalypse.system.file.dto.request;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

/** 批量删除文件请求。 */
public record FileBatchDeleteReq(
    @NotEmpty(message = "待删除文件 ID 列表不能为空") @Size(max = 100, message = "单次最多批量删除 100 个文件")
        List<@NotNull(message = "文件 ID 不能为空") Long> ids) {}
