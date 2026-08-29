package io.apocalypse.system.dict.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 字典数据保存请求（创建/更新共用）。 */
public record DictDataSaveReq(
    @NotBlank(message = "字典类型不能为空") @Size(max = 64, message = "字典类型最长 64 字符") String dictType,
    @NotBlank(message = "展示文本不能为空") @Size(max = 64, message = "展示文本最长 64 字符") String dictLabel,
    @NotBlank(message = "实际值不能为空") @Size(max = 64, message = "实际值最长 64 字符") String dictValue,
    Integer sort,
    Integer status,
    @Size(max = 255, message = "备注最长 255 字符") String remark) {}
