package io.apocalypse.system.dept.dto.response;

/** 部门祖先路径节点（按根到叶排列，供用户工作台渲染部门归属胶囊链）。 */
public record DeptPathNodeResp(Long id, String deptName) {}
