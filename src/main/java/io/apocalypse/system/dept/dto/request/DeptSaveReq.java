package io.apocalypse.system.dept.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** 部门保存请求（创建/更新共用）。 */
public record DeptSaveReq(
    @NotNull(message = "父部门不能为空") @Min(value = 0, message = "父部门不能为负数") Long parentId,
    @NotBlank(message = "部门名称不能为空") @Size(max = 64, message = "部门名称最长 64 字符") String deptName,
    @Size(max = 64, message = "负责人最长 64 字符") String leader,
    @Size(max = 32, message = "联系电话最长 32 字符") String phone,
    Integer sort,
    @Min(value = 0, message = "状态仅支持 0/1") @Max(value = 1, message = "状态仅支持 0/1") Integer status,
    @Size(max = 500, message = "备注最长 500 字符") String remark) {}
