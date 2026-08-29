package io.apocalypse.system.dict.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 字典类型保存请求（创建/更新共用）。 */
public record DictTypeSaveReq(
    @NotBlank(message = "字典类型不能为空") @Size(max = 64, message = "字典类型最长 64 字符") String dictType,
    @NotBlank(message = "字典名称不能为空") @Size(max = 64, message = "字典名称最长 64 字符") String dictName,
    Integer status,
    @Size(max = 255, message = "备注最长 255 字符") String remark) {}
