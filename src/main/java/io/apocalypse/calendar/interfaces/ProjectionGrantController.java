package io.apocalypse.calendar.interfaces;

import io.apocalypse.calendar.application.ProjectionGrantService;
import io.apocalypse.calendar.interfaces.dto.request.ProjectionGrantSaveReq;
import io.apocalypse.calendar.interfaces.dto.response.ProjectionGrantResp;
import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.framework.log.OperLog;
import io.apocalypse.framework.security.SecurityUtils;

import java.util.List;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/calendar/calendars/{calendarId}/projection-grants")
@RequiredArgsConstructor
public class ProjectionGrantController {

  private final ProjectionGrantService projectionGrantService;

  @GetMapping
  @PreAuthorize("hasAuthority('calendar:projection-grant:list')")
  public List<ProjectionGrantResp> list(@PathVariable Long calendarId) {
    return projectionGrantService.list(calendarId, currentUserId());
  }

  @PutMapping("/{sourceSystem}")
  @PreAuthorize("hasAuthority('calendar:projection-grant:edit')")
  @OperLog(title = "日历投影授权", businessType = "GRANT")
  public ProjectionGrantResp save(
      @PathVariable Long calendarId,
      @PathVariable String sourceSystem,
      @RequestBody ProjectionGrantSaveReq request) {
    return projectionGrantService.save(
        calendarId, sourceSystem, request, currentUserId(), currentUsername());
  }

  @DeleteMapping("/{sourceSystem}")
  @PreAuthorize("hasAuthority('calendar:projection-grant:edit')")
  @OperLog(title = "日历投影授权", businessType = "REVOKE")
  public void deactivate(@PathVariable Long calendarId, @PathVariable String sourceSystem) {
    projectionGrantService.deactivate(calendarId, sourceSystem, currentUserId(), currentUsername());
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
