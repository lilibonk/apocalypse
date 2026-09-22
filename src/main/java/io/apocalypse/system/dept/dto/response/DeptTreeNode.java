package io.apocalypse.system.dept.dto.response;

import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

/** 部门树节点（父子嵌套）。 */
public record DeptTreeNode(
    Long id,
    Long parentId,
    String deptName,
    @Schema(nullable = true) String leader,
    @Schema(nullable = true) String phone,
    Integer sort,
    Integer status,
    @Schema(nullable = true) String remark,
    List<DeptTreeNode> children) {}
