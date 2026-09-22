package io.apocalypse.system.dict.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;

/** 字典数据响应。 */
public record DictDataResp(
    Long id,
    String dictType,
    String dictLabel,
    String dictValue,
    Integer sort,
    Integer status,
    @Schema(nullable = true) String remark) {}
