package io.apocalypse.system.role.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import io.swagger.v3.oas.annotations.media.Schema;

/** 角色保存请求（创建/更新共用）。 */
public record RoleSaveReq(
    @NotBlank(message = "角色名称不能为空") @Size(max = 64, message = "角色名称最长 64 字符") String roleName,
    @NotBlank(message = "角色标识不能为空") @Size(max = 64, message = "角色标识最长 64 字符") String roleKey,
    Integer sort,
    @Min(value = 0, message = "状态仅支持 0/1") @Max(value = 1, message = "状态仅支持 0/1") Integer status,
    @Size(max = 500, message = "备注最长 500 字符") String remark,
    @Pattern(regexp = "ALL|DEPT|DEPT_AND_CHILDREN", message = "数据范围仅支持 ALL/DEPT/DEPT_AND_CHILDREN")
        @Schema(
            nullable = true,
            allowableValues = {"ALL", "DEPT", "DEPT_AND_CHILDREN"})
        String dataScope) {}
