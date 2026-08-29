package io.apocalypse.system.dict.dto.response;

/** 字典数据响应。 */
public record DictDataResp(
    Long id,
    String dictType,
    String dictLabel,
    String dictValue,
    Integer sort,
    Integer status,
    String remark) {}
