package io.apocalypse.system.dict.dto.response;

/** 字典类型响应。 */
public record DictTypeResp(
    Long id, String dictType, String dictName, Integer status, String remark) {}
