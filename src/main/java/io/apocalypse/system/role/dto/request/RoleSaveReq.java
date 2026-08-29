package io.apocalypse.system.role.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 角色保存请求（创建/更新共用）。 */
public record RoleSaveReq(
    @NotBlank(message = "角色名称不能为空") @Size(max = 64, message = "角色名称最长 64 字符") String roleName,
    @NotBlank(message = "角色标识不能为空") @Size(max = 64, message = "角色标识最长 64 字符") String roleKey,
    Integer sort,
    Integer status,
    @Size(max = 500, message = "备注最长 500 字符") String remark) {}
