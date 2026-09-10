package io.apocalypse.calendar.interfaces;

import io.apocalypse.calendar.application.CalendarManagementService;
import io.apocalypse.calendar.interfaces.dto.request.CalendarCreateReq;
import io.apocalypse.calendar.interfaces.dto.request.CalendarMemberSaveReq;
import io.apocalypse.calendar.interfaces.dto.request.CalendarUpdateReq;
import io.apocalypse.calendar.interfaces.dto.response.CalendarMemberResp;
import io.apocalypse.calendar.interfaces.dto.response.CalendarResp;
import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.common.response.PageResult;
import io.apocalypse.framework.log.OperLog;
import io.apocalypse.framework.security.SecurityUtils;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import java.util.List;

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
@RequestMapping("/calendar/calendars")
@RequiredArgsConstructor
public class CalendarManagementController {

  private final CalendarManagementService calendarManagementService;

  @GetMapping
  @PreAuthorize("hasAuthority('calendar:calendar:list')")
  public List<CalendarResp> list() {
    return calendarManagementService.list(currentUserId());
  }

  @GetMapping("/{id}")
  @PreAuthorize("hasAuthority('calendar:calendar:list')")
  public CalendarResp detail(@PathVariable Long id) {
    return calendarManagementService.detail(id, currentUserId());
  }

  @PostMapping
  @PreAuthorize("hasAuthority('calendar:calendar:add')")
  @OperLog(title = "日历管理", businessType = "INSERT")
  public CalendarResp create(@Valid @RequestBody CalendarCreateReq request) {
    return calendarManagementService.create(request, currentUserId());
  }

  @PutMapping("/{id}")
  @PreAuthorize("hasAuthority('calendar:calendar:edit')")
  @OperLog(title = "日历管理", businessType = "UPDATE")
  public CalendarResp update(@PathVariable Long id, @Valid @RequestBody CalendarUpdateReq request) {
    return calendarManagementService.update(id, request, currentUserId());
  }

  @PostMapping("/{id}/archive")
  @PreAuthorize("hasAuthority('calendar:calendar:archive')")
  @OperLog(title = "日历管理", businessType = "ARCHIVE")
  public void archive(@PathVariable Long id) {
    calendarManagementService.archive(id, currentUserId());
  }

  @GetMapping("/{id}/members/page")
  @PreAuthorize("hasAuthority('calendar:member:list')")
  public PageResult<CalendarMemberResp> members(
      @PathVariable Long id,
      @RequestParam(defaultValue = "1") @Min(1) int page,
      @RequestParam(defaultValue = "10") @Min(1) @Max(200) int size) {
    return calendarManagementService.members(id, page, size, currentUserId());
  }

  @PutMapping("/{id}/members/{userId}")
  @PreAuthorize("hasAuthority('calendar:member:edit')")
  @OperLog(title = "日历成员", businessType = "GRANT")
  public CalendarMemberResp saveMember(
      @PathVariable Long id,
      @PathVariable Long userId,
      @Valid @RequestBody CalendarMemberSaveReq request) {
    return calendarManagementService.saveMember(id, userId, request, currentUserId());
  }

  @DeleteMapping("/{id}/members/{userId}")
  @PreAuthorize("hasAuthority('calendar:member:edit')")
  @OperLog(title = "日历成员", businessType = "DELETE")
  public void removeMember(@PathVariable Long id, @PathVariable Long userId) {
    calendarManagementService.removeMember(id, userId, currentUserId());
  }

  private static Long currentUserId() {
    return SecurityUtils.currentUserId()
        .orElseThrow(() -> new BizException(ErrorCode.UNAUTHORIZED));
  }
}
