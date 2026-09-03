package io.apocalypse.calendar.interfaces;

import io.apocalypse.calendar.application.ManagedOverrideService;
import io.apocalypse.calendar.interfaces.dto.request.DayOverrideSaveReq;
import io.apocalypse.calendar.interfaces.dto.request.OverridePublishReq;
import io.apocalypse.calendar.interfaces.dto.response.OverrideRevisionResp;
import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.common.response.PageResult;
import io.apocalypse.framework.log.OperLog;
import io.apocalypse.framework.security.SecurityUtils;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import java.time.LocalDate;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
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
@RequestMapping("/calendar/calendars/{calendarId}/managed-overrides")
@RequiredArgsConstructor
@ConditionalOnProperty(
    prefix = "apocalypse.capabilities.calendar",
    name = "enabled",
    havingValue = "true")
public class ManagedOverrideController {

  private final ManagedOverrideService managedOverrideService;

  @GetMapping("/revisions/page")
  @PreAuthorize("hasAuthority('calendar:managed-override:list')")
  public PageResult<OverrideRevisionResp> revisions(
      @PathVariable Long calendarId,
      @RequestParam(defaultValue = "1") @Min(1) int page,
      @RequestParam(defaultValue = "10") @Min(1) @Max(200) int size) {
    return managedOverrideService.revisions(calendarId, page, size, currentUserId());
  }

  @GetMapping("/draft")
  @PreAuthorize("hasAuthority('calendar:managed-override:list')")
  public OverrideRevisionResp draft(@PathVariable Long calendarId) {
    return managedOverrideService.draft(calendarId, currentUserId());
  }

  @PutMapping("/draft/days/{date}")
  @PreAuthorize("hasAuthority('calendar:managed-override:edit')")
  @OperLog(
      title = "托管覆盖",
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
  public OverrideRevisionResp saveDraft(
      @PathVariable Long calendarId,
      @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
      @RequestBody DayOverrideSaveReq request) {
    return managedOverrideService.saveDraft(
        calendarId, date, request, currentUserId(), currentUsername());
  }

  @DeleteMapping("/draft")
  @PreAuthorize("hasAuthority('calendar:managed-override:edit')")
  @OperLog(
      title = "托管覆盖",
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
  public void discardDraft(@PathVariable Long calendarId) {
    managedOverrideService.discardDraft(calendarId, currentUserId(), currentUsername());
  }

  @PostMapping("/draft/publish")
  @PreAuthorize("hasAuthority('calendar:managed-override:publish')")
  @OperLog(
      title = "托管覆盖",
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
  public OverrideRevisionResp publish(
      @PathVariable Long calendarId, @RequestBody OverridePublishReq request) {
    return managedOverrideService.publish(calendarId, request, currentUserId(), currentUsername());
  }

  @PostMapping("/revisions/{revisionId}/withdraw")
  @PreAuthorize("hasAuthority('calendar:managed-override:publish')")
  @OperLog(
      title = "托管覆盖",
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
  public void withdraw(@PathVariable Long calendarId, @PathVariable Long revisionId) {
    managedOverrideService.withdraw(calendarId, revisionId, currentUserId(), currentUsername());
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
