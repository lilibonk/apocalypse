package io.apocalypse.calendar.interfaces;

import io.apocalypse.calendar.application.ManagedEventService;
import io.apocalypse.calendar.interfaces.dto.request.EventPublishReq;
import io.apocalypse.calendar.interfaces.dto.request.ManagedEventCreateReq;
import io.apocalypse.calendar.interfaces.dto.request.ManagedEventDraftSaveReq;
import io.apocalypse.calendar.interfaces.dto.response.CalendarEventResp;
import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.common.response.PageResult;
import io.apocalypse.framework.log.OperLog;
import io.apocalypse.framework.security.SecurityUtils;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
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
@RequestMapping("/calendar/calendars/{calendarId}/managed-events")
@RequiredArgsConstructor
@ConditionalOnProperty(
    prefix = "apocalypse.capabilities.calendar",
    name = "enabled",
    havingValue = "true")
public class ManagedEventController {

  private final ManagedEventService managedEventService;

  @GetMapping("/page")
  @PreAuthorize("hasAuthority('calendar:managed-event:list')")
  public PageResult<CalendarEventResp> page(
      @PathVariable Long calendarId,
      @RequestParam(defaultValue = "1") @Min(1) int page,
      @RequestParam(defaultValue = "20") @Min(1) @Max(200) int size) {
    return managedEventService.page(calendarId, page, size, currentUserId());
  }

  @PostMapping
  @PreAuthorize("hasAuthority('calendar:managed-event:edit')")
  @OperLog(
      title = "托管日程",
      businessType = "CREATE_DRAFT",
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
  public CalendarEventResp createDraft(
      @PathVariable Long calendarId, @RequestBody ManagedEventCreateReq request) {
    return managedEventService.createDraft(calendarId, request, currentUserId(), currentUsername());
  }

  @PutMapping("/{eventId}/draft")
  @PreAuthorize("hasAuthority('calendar:managed-event:edit')")
  @OperLog(
      title = "托管日程",
      businessType = "SAVE_DRAFT",
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
  public CalendarEventResp saveDraft(
      @PathVariable Long calendarId,
      @PathVariable Long eventId,
      @RequestBody ManagedEventDraftSaveReq request) {
    return managedEventService.saveDraft(
        calendarId, eventId, request, currentUserId(), currentUsername());
  }

  @DeleteMapping("/{eventId}/draft")
  @PreAuthorize("hasAuthority('calendar:managed-event:edit')")
  @OperLog(
      title = "托管日程",
      businessType = "DISCARD_DRAFT",
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
  public void discardDraft(@PathVariable Long calendarId, @PathVariable Long eventId) {
    managedEventService.discardDraft(calendarId, eventId, currentUserId(), currentUsername());
  }

  @PostMapping("/{eventId}/publish")
  @PreAuthorize("hasAuthority('calendar:managed-event:publish')")
  @OperLog(
      title = "托管日程",
      businessType = "PUBLISH",
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
  public CalendarEventResp publish(
      @PathVariable Long calendarId,
      @PathVariable Long eventId,
      @RequestBody EventPublishReq request) {
    return managedEventService.publish(
        calendarId, eventId, request, currentUserId(), currentUsername());
  }

  @PostMapping("/{eventId}/withdraw")
  @PreAuthorize("hasAuthority('calendar:managed-event:publish')")
  @OperLog(
      title = "托管日程",
      businessType = "WITHDRAW",
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
  public void withdraw(@PathVariable Long calendarId, @PathVariable Long eventId) {
    managedEventService.withdraw(calendarId, eventId, currentUserId(), currentUsername());
  }

  @PostMapping("/{eventId}/cancel")
  @PreAuthorize("hasAuthority('calendar:managed-event:publish')")
  @OperLog(
      title = "托管日程",
      businessType = "CANCEL",
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
  public void cancel(@PathVariable Long calendarId, @PathVariable Long eventId) {
    managedEventService.cancel(calendarId, eventId, currentUserId(), currentUsername());
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
