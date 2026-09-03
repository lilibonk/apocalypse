package io.apocalypse.calendar.application;

import io.apocalypse.calendar.api.CalendarErrorCode;
import io.apocalypse.calendar.domain.CalendarContext;
import io.apocalypse.calendar.domain.CalendarContextRepository;
import io.apocalypse.calendar.domain.CalendarKind;
import io.apocalypse.calendar.domain.CalendarMemberRepository;
import io.apocalypse.calendar.domain.CalendarMemberSnapshot;
import io.apocalypse.calendar.domain.CalendarMemberState;
import io.apocalypse.calendar.domain.CalendarRole;
import io.apocalypse.calendar.domain.CalendarState;
import io.apocalypse.calendar.interfaces.dto.request.CalendarCreateReq;
import io.apocalypse.calendar.interfaces.dto.request.CalendarMemberSaveReq;
import io.apocalypse.calendar.interfaces.dto.request.CalendarUpdateReq;
import io.apocalypse.calendar.interfaces.dto.response.CalendarMemberResp;
import io.apocalypse.calendar.interfaces.dto.response.CalendarResp;
import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;
import io.apocalypse.common.response.PageResult;
import io.apocalypse.system.api.UserApi;
import io.apocalypse.system.api.UserSummary;

import java.time.DateTimeException;
import java.time.ZoneId;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class CalendarManagementService {

  private final CalendarCapabilityGuard capabilityGuard;

  private final CalendarAccessService calendarAccessService;

  private final CalendarContextRepository calendarContextRepository;

  private final CalendarMemberRepository calendarMemberRepository;

  private final UserApi userApi;

  @Transactional(readOnly = true)
  public List<CalendarResp> list(Long userId) {
    capabilityGuard.requireEnabled();
    return calendarContextRepository.findVisibleByUserId(userId).stream()
        .map(calendar -> toResponse(calendar, userId))
        .toList();
  }

  @Transactional(readOnly = true)
  public CalendarResp detail(Long calendarId, Long userId) {
    capabilityGuard.requireEnabled();
    return toResponse(calendarAccessService.requireVisible(calendarId, userId), userId);
  }

  @Transactional
  public CalendarResp create(CalendarCreateReq request, Long userId) {
    capabilityGuard.requireEnabled();
    requireZoneId(request.zoneId());
    if (calendarContextRepository.findByKey(request.calendarKey()).isPresent()) {
      throw new BizException(ErrorCode.BIZ_ERROR.getCode(), "日历标识已存在");
    }
    CalendarContext parent =
        calendarAccessService.requireDelegableParent(request.parentId(), userId);
    if (!parent.regionCode().equals(request.regionCode())) {
      throw hierarchyError(CalendarErrorCode.CALENDAR_HIERARCHY_INVALID);
    }
    calendarContextRepository.lockHierarchy(request.regionCode());
    parent = calendarAccessService.requireDelegableParent(request.parentId(), userId);
    if (calendarAccessService.hierarchy(parent).size() > 8) {
      throw hierarchyError(CalendarErrorCode.CALENDAR_HIERARCHY_TOO_DEEP);
    }
    CalendarContext created =
        CalendarContext.managed(
            request.calendarKey(),
            parent.id(),
            request.name().trim(),
            request.regionCode(),
            request.zoneId());
    calendarContextRepository.save(created);
    calendarMemberRepository.save(
        new CalendarMemberSnapshot(
            null, created.id(), userId, CalendarRole.PUBLISHER, CalendarMemberState.ACTIVE, 0));
    return toResponse(
        calendarContextRepository.findById(created.id()).orElseThrow(this::notFound), userId);
  }

  @Transactional
  public CalendarResp update(Long calendarId, CalendarUpdateReq request, Long userId) {
    capabilityGuard.requireEnabled();
    calendarAccessService.requireRole(calendarId, userId, CalendarRole.PUBLISHER);
    CalendarContext calendar = calendarAccessService.requireVisible(calendarId, userId);
    if (calendar.version() != request.expectedVersion()) {
      throw new BizException(ErrorCode.CONFLICT);
    }
    if (request.state() == CalendarState.ARCHIVED) {
      throw new BizException(ErrorCode.PARAM_INVALID.getCode(), "请使用归档接口");
    }
    requireZoneId(request.zoneId());
    CalendarContext parent =
        calendarAccessService.requireDelegableParent(request.parentId(), userId);
    calendarContextRepository.lockHierarchy(calendar.regionCode());
    parent = calendarAccessService.requireDelegableParent(request.parentId(), userId);
    List<CalendarContext> parentHierarchy = calendarAccessService.hierarchy(parent);
    if (!parent.regionCode().equals(calendar.regionCode())
        || parentHierarchy.stream().anyMatch(item -> item.id().equals(calendar.id()))) {
      throw hierarchyError(CalendarErrorCode.CALENDAR_HIERARCHY_INVALID);
    }
    // Moving an ancestor moves its whole subtree. Checking only the proposed parent can leave
    // existing descendants unreadable after an otherwise successful update.
    if (parentHierarchy.size() + calendarContextRepository.descendantDepth(calendarId) > 8) {
      throw hierarchyError(CalendarErrorCode.CALENDAR_HIERARCHY_TOO_DEEP);
    }
    calendar.update(parent.id(), request.name().trim(), request.zoneId(), request.state());
    calendarContextRepository.save(calendar);
    return toResponse(
        calendarContextRepository.findById(calendarId).orElseThrow(this::notFound), userId);
  }

  @Transactional
  public void archive(Long calendarId, Long userId) {
    capabilityGuard.requireEnabled();
    calendarAccessService.requireRole(calendarId, userId, CalendarRole.PUBLISHER);
    CalendarContext calendar = calendarAccessService.requireVisible(calendarId, userId);
    calendar.archive();
    calendarContextRepository.save(calendar);
  }

  @Transactional(readOnly = true)
  public PageResult<CalendarMemberResp> members(Long calendarId, int page, int size, Long userId) {
    capabilityGuard.requireEnabled();
    calendarAccessService.requireRole(calendarId, userId, CalendarRole.PUBLISHER);
    return calendarMemberRepository.pageActive(calendarId, page, size).map(this::toMemberResponse);
  }

  @Transactional
  public CalendarMemberResp saveMember(
      Long calendarId, Long targetUserId, CalendarMemberSaveReq request, Long userId) {
    capabilityGuard.requireEnabled();
    calendarAccessService.requireRole(calendarId, userId, CalendarRole.PUBLISHER);
    UserSummary target = userApi.getById(targetUserId);
    List<CalendarMemberSnapshot> members = calendarMemberRepository.lockActiveMembers(calendarId);
    CalendarMemberSnapshot existing =
        members.stream()
            .filter(member -> member.userId().equals(targetUserId))
            .findFirst()
            .orElse(null);
    int actualVersion = existing == null ? 0 : existing.version();
    if (request.expectedVersion() != actualVersion) {
      throw new BizException(ErrorCode.CONFLICT);
    }
    if (existing != null
        && existing.role() == CalendarRole.PUBLISHER
        && request.role() != CalendarRole.PUBLISHER) {
      requireAnotherPublisher(members, targetUserId);
    }
    CalendarMemberSnapshot saved =
        calendarMemberRepository.save(
            new CalendarMemberSnapshot(
                existing == null ? null : existing.id(),
                calendarId,
                target.id(),
                request.role(),
                CalendarMemberState.ACTIVE,
                actualVersion));
    return toMemberResponse(saved);
  }

  @Transactional
  public void removeMember(Long calendarId, Long targetUserId, Long userId) {
    capabilityGuard.requireEnabled();
    calendarAccessService.requireRole(calendarId, userId, CalendarRole.PUBLISHER);
    List<CalendarMemberSnapshot> members = calendarMemberRepository.lockActiveMembers(calendarId);
    CalendarMemberSnapshot target =
        members.stream()
            .filter(member -> member.userId().equals(targetUserId))
            .findFirst()
            .orElseThrow(this::notFound);
    if (target.role() == CalendarRole.PUBLISHER) {
      requireAnotherPublisher(members, targetUserId);
    }
    calendarMemberRepository.delete(target);
  }

  private void requireAnotherPublisher(List<CalendarMemberSnapshot> members, Long excludedUserId) {
    boolean exists =
        members.stream()
            .anyMatch(
                member ->
                    member.role() == CalendarRole.PUBLISHER
                        && !member.userId().equals(excludedUserId));
    if (!exists) {
      CalendarErrorCode error = CalendarErrorCode.CALENDAR_LAST_PUBLISHER_REQUIRED;
      throw new BizException(error.getCode(), error.getMessage());
    }
  }

  private CalendarResp toResponse(CalendarContext calendar, Long userId) {
    CalendarRole role =
        calendar.kind() == CalendarKind.SYSTEM
            ? null
            : calendarContextRepository.findActiveRole(calendar.id(), userId).orElse(null);
    return new CalendarResp(
        calendar.id(),
        calendar.calendarKey(),
        calendar.name(),
        calendar.kind(),
        calendar.parentId(),
        calendar.regionCode(),
        calendar.zoneId(),
        calendar.state(),
        role,
        calendar.version());
  }

  private CalendarMemberResp toMemberResponse(CalendarMemberSnapshot member) {
    UserSummary user = userApi.getById(member.userId());
    return new CalendarMemberResp(
        user.id(),
        user.username(),
        user.nickname(),
        member.role(),
        member.state(),
        member.version());
  }

  private static void requireZoneId(String zoneId) {
    try {
      ZoneId.of(zoneId);
    } catch (DateTimeException | NullPointerException e) {
      CalendarErrorCode error = CalendarErrorCode.CALENDAR_TIME_ZONE_INVALID;
      throw new BizException(error.getCode(), error.getMessage());
    }
  }

  private static BizException hierarchyError(CalendarErrorCode error) {
    return new BizException(error.getCode(), error.getMessage());
  }

  private BizException notFound() {
    return new BizException(ErrorCode.NOT_FOUND);
  }
}
