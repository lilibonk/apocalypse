package io.apocalypse.system.authorization.controller;

import io.apocalypse.framework.log.OperLog;
import io.apocalypse.system.authorization.dto.request.RoleNavigationSaveReq;
import io.apocalypse.system.authorization.dto.request.RolePermissionsSaveReq;
import io.apocalypse.system.authorization.dto.response.RoleNavigationResp;
import io.apocalypse.system.authorization.dto.response.RolePermissionsResp;
import io.apocalypse.system.authorization.service.RoleAuthorizationService;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/system/roles")
@RequiredArgsConstructor
public class RoleAuthorizationController {
  private final RoleAuthorizationService service;

  @GetMapping("/{id}/permissions")
  @PreAuthorize("hasAuthority('system:role:list')")
  public RolePermissionsResp permissions(@PathVariable Long id) {
    return service.permissions(id);
  }

  @PutMapping("/{id}/permissions")
  @PreAuthorize("hasAuthority('system:role:edit')")
  @OperLog(title = "角色业务授权", businessType = "GRANT")
  public void savePermissions(
      @PathVariable Long id, @Validated @RequestBody RolePermissionsSaveReq request) {
    service.savePermissions(id, request);
  }

  @GetMapping("/{id}/navigation")
  @PreAuthorize("hasAuthority('system:role:list')")
  public RoleNavigationResp navigation(@PathVariable Long id) {
    return service.navigation(id);
  }

  @PutMapping("/{id}/navigation")
  @PreAuthorize("hasAuthority('system:role:edit')")
  @OperLog(title = "角色导航分配", businessType = "GRANT")
  public void saveNavigation(
      @PathVariable Long id, @Validated @RequestBody RoleNavigationSaveReq request) {
    service.saveNavigation(id, request);
  }
}
