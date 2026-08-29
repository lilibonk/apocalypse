package io.apocalypse.system.role.controller;

import io.apocalypse.common.response.PageResult;
import io.apocalypse.framework.log.OperLog;
import io.apocalypse.system.role.dto.request.RoleSaveReq;
import io.apocalypse.system.role.dto.response.RoleResp;
import io.apocalypse.system.role.dto.response.RoleUserResp;
import io.apocalypse.system.role.service.RoleService;

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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;

/**
 * 角色管理端点。 写操作按 V4 种子 perms 鉴权（{@code system:role:add/edit/remove}，授权动作归 edit），读操作 {@code
 * system:role:list}。
 */
@RestController
@RequestMapping("/system/roles")
@RequiredArgsConstructor
public class RoleController {

  private final RoleService roleService;

  /** 分页查询。 */
  @GetMapping("/page")
  @PreAuthorize("hasAuthority('system:role:list')")
  public PageResult<RoleResp> page(
      @RequestParam(defaultValue = "1") int page,
      @RequestParam(defaultValue = "10") int size,
      @RequestParam(required = false) String keyword) {
    return roleService.page(page, size, keyword);
  }

  /** 新增，返回主键。 */
  @PostMapping
  @PreAuthorize("hasAuthority('system:role:add')")
  @OperLog(title = "角色管理", businessType = "INSERT")
  public Long create(@Validated @RequestBody RoleSaveReq req) {
    return roleService.create(req);
  }

  /** 更新。 */
  @PutMapping("/{id}")
  @PreAuthorize("hasAuthority('system:role:edit')")
  @OperLog(title = "角色管理", businessType = "UPDATE")
  public void update(@PathVariable Long id, @Validated @RequestBody RoleSaveReq req) {
    roleService.update(id, req);
  }

  /** 删除（逻辑删）。 */
  @DeleteMapping("/{id}")
  @PreAuthorize("hasAuthority('system:role:remove')")
  @OperLog(title = "角色管理", businessType = "DELETE")
  public void delete(@PathVariable Long id) {
    roleService.delete(id);
  }

  /** 重置角色菜单（授权）。 */
  @PutMapping("/{id}/menus")
  @PreAuthorize("hasAuthority('system:role:edit')")
  @OperLog(title = "角色管理", businessType = "GRANT")
  public void assignMenus(@PathVariable Long id, @RequestBody List<Long> menuIds) {
    roleService.assignMenus(id, menuIds);
  }

  /** 查询角色当前菜单授权。 */
  @GetMapping("/{id}/menus")
  @PreAuthorize("hasAuthority('system:role:list')")
  public List<Long> menuIds(@PathVariable Long id) {
    return roleService.menuIds(id);
  }

  /** 分页查询角色下的用户。 */
  @GetMapping("/{id}/users")
  @PreAuthorize("hasAuthority('system:role:list')")
  public PageResult<RoleUserResp> pageUsers(
      @PathVariable Long id,
      @RequestParam(defaultValue = "1") int page,
      @RequestParam(defaultValue = "10") int size) {
    return roleService.pageUsers(id, page, size);
  }

  /** 整体替换角色下的用户。 */
  @PutMapping("/{id}/users")
  @PreAuthorize("hasAuthority('system:role:edit')")
  @OperLog(title = "角色管理", businessType = "GRANT")
  public void assignUsers(@PathVariable Long id, @RequestBody List<Long> userIds) {
    roleService.assignUsers(id, userIds);
  }
}
