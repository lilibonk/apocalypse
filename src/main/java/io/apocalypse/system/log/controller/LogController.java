package io.apocalypse.system.log.controller;

import io.apocalypse.common.response.PageResult;
import io.apocalypse.system.log.dto.response.LoginLogResp;
import io.apocalypse.system.log.dto.response.OperLogResp;
import io.apocalypse.system.log.service.LogQueryService;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;

/** 日志查询端点（只读）。按 V3 菜单种子 perms 鉴权（{@code system:log:login} / {@code system:log:oper}）。 */
@RestController
@RequestMapping("/system/logs")
@RequiredArgsConstructor
public class LogController {

  private final LogQueryService logQueryService;

  /** 登录日志分页。 */
  @GetMapping("/login")
  @PreAuthorize("hasAuthority('system:log:login')")
  public PageResult<LoginLogResp> pageLoginLog(
      @RequestParam(defaultValue = "1") int page,
      @RequestParam(defaultValue = "10") int size,
      @RequestParam(required = false) String keyword) {
    return logQueryService.pageLoginLog(page, size, keyword);
  }

  /** 操作日志分页。 */
  @GetMapping("/oper")
  @PreAuthorize("hasAuthority('system:log:oper')")
  public PageResult<OperLogResp> pageOperLog(
      @RequestParam(defaultValue = "1") int page,
      @RequestParam(defaultValue = "10") int size,
      @RequestParam(required = false) String keyword) {
    return logQueryService.pageOperLog(page, size, keyword);
  }
}
