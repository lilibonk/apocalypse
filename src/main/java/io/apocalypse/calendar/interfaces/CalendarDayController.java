package io.apocalypse.calendar.interfaces;

import io.apocalypse.calendar.application.DateQueryService;
import io.apocalypse.calendar.interfaces.dto.response.EffectiveDayResp;
import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.framework.security.SecurityUtils;

import java.time.LocalDate;
import java.util.List;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;

/** Calendar 日期有效值查询；Controller 只在 capability 显式启用时注册。 */
@Validated
@RestController
@RequestMapping("/calendar")
@RequiredArgsConstructor
@ConditionalOnProperty(
    prefix = "apocalypse.capabilities.calendar",
    name = "enabled",
    havingValue = "true")
public class CalendarDayController {

  private final DateQueryService dateQueryService;

  @GetMapping("/days")
  @PreAuthorize("hasAuthority('calendar:day:list')")
  public List<EffectiveDayResp> list(
      @RequestParam Long calendarId,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
      @RequestParam(required = false) String zoneId,
      @RequestParam(defaultValue = "true") boolean includePersonal) {
    return dateQueryService.list(calendarId, from, to, zoneId, currentUserId(), includePersonal);
  }

  @GetMapping("/days/{date}")
  @PreAuthorize("hasAuthority('calendar:day:read')")
  public EffectiveDayResp detail(
      @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
      @RequestParam Long calendarId,
      @RequestParam(required = false) String zoneId,
      @RequestParam(defaultValue = "true") boolean includePersonal) {
    return dateQueryService.detail(calendarId, date, zoneId, currentUserId(), includePersonal);
  }

  private static Long currentUserId() {
    return SecurityUtils.currentUserId()
        .orElseThrow(() -> new BizException(ErrorCode.UNAUTHORIZED));
  }
}
