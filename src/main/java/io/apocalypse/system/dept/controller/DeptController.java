package io.apocalypse.system.dept.controller;

import io.apocalypse.framework.log.OperLog;
import io.apocalypse.system.dept.dto.request.DeptSaveReq;
import io.apocalypse.system.dept.dto.response.DeptTreeNode;
import io.apocalypse.system.dept.service.DeptService;

import java.util.List;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;

/** 部门管理端点。按 V3 菜单种子 perms 鉴权（{@code system:dept:*}），写操作落操作日志。 */
@RestController
@RequestMapping("/system/depts")
@RequiredArgsConstructor
public class DeptController {

  private final DeptService deptService;

  /** 全量部门树。 */
  @GetMapping("/tree")
  @PreAuthorize("hasAuthority('system:dept:list')")
  public List<DeptTreeNode> tree() {
    return deptService.tree();
  }

  /** 新增，返回主键。 */
  @PostMapping
  @PreAuthorize("hasAuthority('system:dept:add')")
  @OperLog(title = "部门管理", businessType = "INSERT")
  public Long create(@Validated @RequestBody DeptSaveReq req) {
    return deptService.create(req);
  }

  /** 更新。 */
  @PutMapping("/{id}")
  @PreAuthorize("hasAuthority('system:dept:edit')")
  @OperLog(title = "部门管理", businessType = "UPDATE")
  public void update(@PathVariable Long id, @Validated @RequestBody DeptSaveReq req) {
    deptService.update(id, req);
  }

  /** 删除（逻辑删）。 */
  @DeleteMapping("/{id}")
  @PreAuthorize("hasAuthority('system:dept:remove')")
  @OperLog(title = "部门管理", businessType = "DELETE")
  public void delete(@PathVariable Long id) {
    deptService.delete(id);
  }
}
