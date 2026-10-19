package io.apocalypse.system.authorization.controller;

import io.apocalypse.system.authorization.dto.response.AuthorizationOverviewResp;
import io.apocalypse.system.authorization.dto.response.PermissionHoldersResp;
import io.apocalypse.system.authorization.service.AuthorizationInsightService;

import jakarta.validation.constraints.NotNull;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;

/** 确定性授权洞察（只读）：权限全景与权限反查。需要同时具备角色与权限目录查看权限。 */
@Validated
@RestController
@RequestMapping("/system/authorization/insights")
@RequiredArgsConstructor
public class AuthorizationInsightController {

  private final AuthorizationInsightService service;

  @GetMapping("/overview")
  @PreAuthorize("hasAuthority('system:role:list') and hasAuthority('system:permission:list')")
  public AuthorizationOverviewResp overview() {
    return service.overview();
  }

  @GetMapping("/permission-holders")
  @PreAuthorize("hasAuthority('system:role:list') and hasAuthority('system:permission:list')")
  public PermissionHoldersResp holders(
      @RequestParam @NotNull(message = "权限 ID 不能为空") Long permissionId) {
    return service.holders(permissionId);
  }
}
