package io.apocalypse.system.dict.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;

/** 字典类型响应。 */
public record DictTypeResp(
    Long id,
    String dictType,
    String dictName,
    Integer status,
    @Schema(nullable = true) String remark) {}
