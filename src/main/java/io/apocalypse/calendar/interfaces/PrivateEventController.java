package io.apocalypse.calendar.interfaces;

import io.apocalypse.calendar.application.PrivateEventService;
import io.apocalypse.calendar.interfaces.dto.request.PrivateEventCreateReq;
import io.apocalypse.calendar.interfaces.dto.request.PrivateEventUpdateReq;
import io.apocalypse.calendar.interfaces.dto.response.CalendarEventResp;
import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.common.response.PageResult;
import io.apocalypse.framework.log.OperLog;
import io.apocalypse.framework.security.SecurityUtils;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import java.time.LocalDate;

import org.springframework.format.annotation.DateTimeFormat;
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

@Validated
@RestController
@RequestMapping("/calendar/events")
@RequiredArgsConstructor
public class PrivateEventController {

  private final PrivateEventService privateEventService;

  @GetMapping("/page")
  @PreAuthorize("hasAuthority('calendar:event:list')")
  public PageResult<CalendarEventResp> page(
      @RequestParam Long calendarId,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
      @RequestParam(defaultValue = "1") @Min(1) int page,
      @RequestParam(defaultValue = "20") @Min(1) @Max(200) int size) {
    return privateEventService.page(calendarId, from, to, page, size, currentUserId());
  }

  @GetMapping("/{id}")
  @PreAuthorize("hasAuthority('calendar:event:read')")
  public CalendarEventResp detail(@PathVariable Long id) {
    return privateEventService.detail(id, currentUserId());
  }

  @PostMapping
  @PreAuthorize("hasAuthority('calendar:event:add')")
  @OperLog(
      title = "私人日程",
      businessType = "INSERT",
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
  public CalendarEventResp create(@RequestBody PrivateEventCreateReq request) {
    return privateEventService.create(request, currentUserId(), currentUsername());
  }

  @PutMapping("/{id}")
  @PreAuthorize("hasAuthority('calendar:event:edit')")
  @OperLog(
      title = "私人日程",
      businessType = "UPDATE",
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
  public CalendarEventResp update(
      @PathVariable Long id, @RequestBody PrivateEventUpdateReq request) {
    return privateEventService.update(id, request, currentUserId(), currentUsername());
  }

  @DeleteMapping("/{id}")
  @PreAuthorize("hasAuthority('calendar:event:remove')")
  @OperLog(
      title = "私人日程",
      businessType = "DELETE",
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
  public void delete(@PathVariable Long id) {
    privateEventService.delete(id, currentUserId(), currentUsername());
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
