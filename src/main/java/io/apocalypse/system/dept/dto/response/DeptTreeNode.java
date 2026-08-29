package io.apocalypse.system.dept.dto.response;

import java.util.List;

/** 部门树节点（父子嵌套）。 */
public record DeptTreeNode(
    Long id,
    Long parentId,
    String deptName,
    String leader,
    String phone,
    Integer sort,
    Integer status,
    String remark,
    List<DeptTreeNode> children) {}
