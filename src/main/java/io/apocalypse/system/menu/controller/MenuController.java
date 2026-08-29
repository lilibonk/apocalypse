package io.apocalypse.system.menu.controller;

import io.apocalypse.framework.log.OperLog;
import io.apocalypse.system.menu.dto.request.MenuSaveReq;
import io.apocalypse.system.menu.dto.response.MenuTreeNode;
import io.apocalypse.system.menu.service.MenuService;

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

/**
 * 菜单管理端点。 写操作按 V4 种子 perms 鉴权（{@code system:menu:add/edit/remove}），树查询 {@code system:menu:list}。
 */
@RestController
@RequestMapping("/system/menus")
@RequiredArgsConstructor
public class MenuController {

  private final MenuService menuService;

  /** 全量菜单树。 */
  @GetMapping("/tree")
  @PreAuthorize("hasAuthority('system:menu:list')")
  public List<MenuTreeNode> tree() {
    return menuService.tree();
  }

  /** 新增，返回主键。 */
  @PostMapping
  @PreAuthorize("hasAuthority('system:menu:add')")
  @OperLog(title = "菜单管理", businessType = "INSERT")
  public Long create(@Validated @RequestBody MenuSaveReq req) {
    return menuService.create(req);
  }

  /** 更新。 */
  @PutMapping("/{id}")
  @PreAuthorize("hasAuthority('system:menu:edit')")
  @OperLog(title = "菜单管理", businessType = "UPDATE")
  public void update(@PathVariable Long id, @Validated @RequestBody MenuSaveReq req) {
    menuService.update(id, req);
  }

  /** 删除（逻辑删）。 */
  @DeleteMapping("/{id}")
  @PreAuthorize("hasAuthority('system:menu:remove')")
  @OperLog(title = "菜单管理", businessType = "DELETE")
  public void delete(@PathVariable Long id) {
    menuService.delete(id);
  }
}
