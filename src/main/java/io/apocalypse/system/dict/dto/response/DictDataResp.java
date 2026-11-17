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
    String tagTone,
    Integer isDefault,
    @Schema(nullable = true) String remark) {

  public DictDataResp {
    tagTone = (tagTone == null || tagTone.isBlank()) ? "NEUTRAL" : tagTone;
    isDefault = isDefault == null ? 0 : isDefault;
  }
}
