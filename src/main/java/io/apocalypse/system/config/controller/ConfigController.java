package io.apocalypse.system.config.controller;

import io.apocalypse.common.response.PageResult;
import io.apocalypse.framework.log.OperLog;
import io.apocalypse.system.config.dto.request.ConfigSaveReq;
import io.apocalypse.system.config.dto.response.ConfigResp;
import io.apocalypse.system.config.service.ConfigService;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

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

/** 参数设置端点。按 V3 菜单种子 perms 鉴权（{@code system:config:*}），写操作落操作日志。 */
@Validated
@RestController
@RequestMapping("/system/configs")
@RequiredArgsConstructor
public class ConfigController {

  private final ConfigService configService;

  /** 分页查询。 */
  @GetMapping("/page")
  @PreAuthorize("hasAuthority('system:config:list')")
  public PageResult<ConfigResp> page(
      @RequestParam(defaultValue = "1") @Min(value = 1, message = "页码必须大于 0") int page,
      @RequestParam(defaultValue = "10")
          @Min(value = 1, message = "每页条数必须大于 0")
          @Max(value = 200, message = "每页条数不能超过 200")
          int size,
      @RequestParam(required = false) String keyword) {
    return configService.page(page, size, keyword);
  }

  /** 按参数键读取。 */
  @GetMapping("/key/{key}")
  @PreAuthorize("hasAuthority('system:config:list')")
  public ConfigResp getByKey(@PathVariable String key) {
    return configService.getByKey(key);
  }

  /** 新增，返回主键。 */
  @PostMapping
  @PreAuthorize("hasAuthority('system:config:add')")
  @OperLog(title = "参数设置", businessType = "INSERT")
  public Long create(@Validated @RequestBody ConfigSaveReq req) {
    return configService.create(req);
  }

  /** 更新。 */
  @PutMapping("/{id}")
  @PreAuthorize("hasAuthority('system:config:edit')")
  @OperLog(title = "参数设置", businessType = "UPDATE")
  public void update(@PathVariable Long id, @Validated @RequestBody ConfigSaveReq req) {
    configService.update(id, req);
  }

  /** 删除（逻辑删）。 */
  @DeleteMapping("/{id}")
  @PreAuthorize("hasAuthority('system:config:remove')")
  @OperLog(title = "参数设置", businessType = "DELETE")
  public void delete(@PathVariable Long id) {
    configService.delete(id);
  }
}
