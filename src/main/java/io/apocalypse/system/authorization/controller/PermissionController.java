package io.apocalypse.system.authorization.controller;

import io.apocalypse.common.response.PageResult;
import io.apocalypse.framework.log.OperLog;
import io.apocalypse.system.authorization.dto.request.PermissionSaveReq;
import io.apocalypse.system.authorization.dto.response.PermissionDefinitionResp;
import io.apocalypse.system.authorization.service.PermissionDefinitionService;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;

@Validated
@RestController
@RequestMapping("/system/permissions")
@RequiredArgsConstructor
public class PermissionController {
  private final PermissionDefinitionService service;

  @GetMapping("/page")
  @PreAuthorize("hasAuthority('system:permission:list')")
  public PageResult<PermissionDefinitionResp> page(
      @RequestParam(defaultValue = "1") @Min(1) int page,
      @RequestParam(defaultValue = "10") @Min(1) @Max(200) int size,
      @RequestParam(required = false) String keyword,
      @RequestParam(required = false) String moduleKey,
      @RequestParam(required = false) String resource,
      @RequestParam(required = false) @Min(0) @Max(1) Integer status) {
    return service.page(page, size, keyword, moduleKey, resource, status);
  }

  @GetMapping("/{id}")
  @PreAuthorize("hasAuthority('system:permission:list')")
  public PermissionDefinitionResp get(@PathVariable Long id) {
    return service.get(id);
  }

  @PutMapping("/{id}")
  @PreAuthorize("hasAuthority('system:permission:edit')")
  @OperLog(title = "权限目录", businessType = "UPDATE")
  public void update(@PathVariable Long id, @Validated @RequestBody PermissionSaveReq request) {
    service.update(id, request);
  }
}
