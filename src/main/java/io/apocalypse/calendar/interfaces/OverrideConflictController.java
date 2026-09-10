package io.apocalypse.calendar.interfaces;

import io.apocalypse.calendar.application.OverrideConflictService;
import io.apocalypse.calendar.interfaces.dto.request.ConflictResolveReq;
import io.apocalypse.calendar.interfaces.dto.response.OverrideConflictResp;
import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.common.response.PageResult;
import io.apocalypse.framework.log.OperLog;
import io.apocalypse.framework.security.SecurityUtils;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;

@Validated
@RestController
@RequiredArgsConstructor
public class OverrideConflictController {

  private final OverrideConflictService overrideConflictService;

  @GetMapping("/calendar/calendars/{calendarId}/personal-override-conflicts/page")
  @PreAuthorize("hasAuthority('calendar:personal-override:list')")
  public PageResult<OverrideConflictResp> pagePersonal(
      @PathVariable Long calendarId,
      @RequestParam(defaultValue = "1") @Min(1) int page,
      @RequestParam(defaultValue = "20") @Min(1) @Max(200) int size) {
    return overrideConflictService.pagePersonal(calendarId, page, size, currentUserId());
  }

  @PostMapping("/calendar/calendars/{calendarId}/personal-override-conflicts/{conflictId}/resolve")
  @PreAuthorize("hasAuthority('calendar:personal-override:edit')")
  @OperLog(
      title = "覆盖冲突",
      businessType = "RESOLVE",
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
  public OverrideConflictResp resolvePersonal(
      @PathVariable Long calendarId,
      @PathVariable Long conflictId,
      @RequestBody ConflictResolveReq request) {
    return overrideConflictService.resolvePersonal(
        calendarId, conflictId, request, currentUserId(), currentUsername());
  }

  @GetMapping("/calendar/calendars/{calendarId}/managed-override-conflicts/page")
  @PreAuthorize("hasAuthority('calendar:managed-override:list')")
  public PageResult<OverrideConflictResp> pageManaged(
      @PathVariable Long calendarId,
      @RequestParam(defaultValue = "1") @Min(1) int page,
      @RequestParam(defaultValue = "20") @Min(1) @Max(200) int size) {
    return overrideConflictService.pageManaged(calendarId, page, size, currentUserId());
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
