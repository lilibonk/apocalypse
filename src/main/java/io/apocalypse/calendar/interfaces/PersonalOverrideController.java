package io.apocalypse.calendar.interfaces;

import io.apocalypse.calendar.application.PersonalOverrideService;
import io.apocalypse.calendar.interfaces.dto.request.DayOverrideSaveReq;
import io.apocalypse.calendar.interfaces.dto.response.OverrideRevisionResp;
import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.framework.log.OperLog;
import io.apocalypse.framework.security.SecurityUtils;

import java.time.LocalDate;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.format.annotation.DateTimeFormat;
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
@RequestMapping("/calendar/calendars/{calendarId}/personal-overrides")
@RequiredArgsConstructor
@ConditionalOnProperty(
    prefix = "apocalypse.capabilities.calendar",
    name = "enabled",
    havingValue = "true")
public class PersonalOverrideController {

  private final PersonalOverrideService personalOverrideService;

  @GetMapping
  @PreAuthorize("hasAuthority('calendar:personal-override:list')")
  public OverrideRevisionResp current(
      @PathVariable Long calendarId,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
    return personalOverrideService.current(calendarId, from, to, currentUserId());
  }

  @PutMapping("/{date}")
  @PreAuthorize("hasAuthority('calendar:personal-override:edit')")
  @OperLog(
      title = "个人覆盖",
      businessType = "SAVE",
      fields = {
        "/id",
        "/calendarId",
        "/eventId",
        "/revisionId",
        "/conflictId",
        "/date",
        "/version",
        "/revisionNo",
        "/revisionVersion",
        "/revisionState",
        "/state",
        "/request/expectedRevisionNo",
        "/request/expectedDraftVersion",
        "/request/expectedVersion",
        "/request/resolution",
        "/metadata/calendarId",
        "/metadata/year",
        "/metadata/targetType"
      })
  public OverrideRevisionResp save(
      @PathVariable Long calendarId,
      @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
      @RequestBody DayOverrideSaveReq request) {
    return personalOverrideService.save(
        calendarId, date, request, currentUserId(), currentUsername());
  }

  private static Long currentUserId() {
    return SecurityUtils.currentUserId()
        .orElseThrow(() -> new BizException(ErrorCode.UNAUTHORIZED));
  }

  private static String currentUsername() {
    return SecurityUtils.currentUsername()
        .orElseThrow(() -> new BizException(ErrorCode.UNAUTHORIZED));
  }
}
