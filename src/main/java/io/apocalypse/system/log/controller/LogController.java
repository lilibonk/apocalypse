package io.apocalypse.system.log.controller;

import io.apocalypse.common.response.PageResult;
import io.apocalypse.system.log.dto.response.LoginHeatmapResp;
import io.apocalypse.system.log.dto.response.LoginInsightResp;
import io.apocalypse.system.log.dto.response.LoginLogResp;
import io.apocalypse.system.log.dto.response.OperInsightResp;
import io.apocalypse.system.log.dto.response.OperLogResp;
import io.apocalypse.system.log.service.LogInsightRange;
import io.apocalypse.system.log.service.LogInsightService;
import io.apocalypse.system.log.service.LogQueryService;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;

/** 日志查询端点（只读）。按初始基线菜单种子 perms 鉴权（{@code system:log:login} / {@code system:log:oper}）。 */
@Validated
@RestController
@RequestMapping("/system/logs")
@RequiredArgsConstructor
public class LogController {

  private final LogQueryService logQueryService;

  private final LogInsightService logInsightService;

  /** 登录日志分页。 */
  @GetMapping("/login")
  @PreAuthorize("hasAuthority('system:log:login')")
  public PageResult<LoginLogResp> pageLoginLog(
      @RequestParam(defaultValue = "1") @Min(value = 1, message = "页码必须大于 0") int page,
      @RequestParam(defaultValue = "10")
          @Min(value = 1, message = "每页条数必须大于 0")
          @Max(value = 200, message = "每页条数不能超过 200")
          int size,
      @RequestParam(required = false) String keyword) {
    return logQueryService.pageLoginLog(page, size, keyword);
  }

  /** 登录日志周期统计（服务端全量聚合）。 */
  @GetMapping("/login/insights")
  @PreAuthorize("hasAuthority('system:log:login')")
  public LoginInsightResp loginInsights(@RequestParam(defaultValue = "DAY") LogInsightRange range) {
    return logInsightService.loginInsights(range);
  }

  /** 登录日志星期×小时热力图（仅 WEEK / MONTH）。 */
  @GetMapping("/login/heatmap")
  @PreAuthorize("hasAuthority('system:log:login')")
  public LoginHeatmapResp loginHeatmap(@RequestParam(defaultValue = "WEEK") LogInsightRange range) {
    return logInsightService.loginHeatmap(range);
  }

  /** 操作日志周期统计（服务端全量聚合）。 */
  @GetMapping("/oper/insights")
  @PreAuthorize("hasAuthority('system:log:oper')")
  public OperInsightResp operInsights(@RequestParam(defaultValue = "DAY") LogInsightRange range) {
    return logInsightService.operInsights(range);
  }

  /** 操作日志分页。 */
  @GetMapping("/oper")
  @PreAuthorize("hasAuthority('system:log:oper')")
  public PageResult<OperLogResp> pageOperLog(
      @RequestParam(defaultValue = "1") @Min(value = 1, message = "页码必须大于 0") int page,
      @RequestParam(defaultValue = "10")
          @Min(value = 1, message = "每页条数必须大于 0")
          @Max(value = 200, message = "每页条数不能超过 200")
          int size,
      @RequestParam(required = false) String keyword) {
    return logQueryService.pageOperLog(page, size, keyword);
  }
}
