package io.apocalypse.calendar.application;

import io.apocalypse.calendar.api.CalendarErrorCode;
import io.apocalypse.calendar.domain.CalendarContext;
import io.apocalypse.calendar.domain.CalendarContextRepository;
import io.apocalypse.calendar.domain.CalendarKind;
import io.apocalypse.calendar.domain.CalendarRole;
import io.apocalypse.calendar.domain.CalendarState;
import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

/** Calendar 对象可见性、范围角色与继承链的统一应用层守卫。 */
@Service
@RequiredArgsConstructor
public class CalendarAccessService {

  private final CalendarContextRepository calendarContextRepository;

  public CalendarContext requireVisible(Long calendarId, Long userId) {
    if (calendarId == null || userId == null) {
      throw notFound();
    }
    CalendarContext calendar =
        calendarContextRepository
            .findById(calendarId)
            .filter(value -> value.state() != CalendarState.ARCHIVED)
            .orElseThrow(CalendarAccessService::notFound);
    if (calendar.kind() == CalendarKind.MANAGED
        && calendarContextRepository.findActiveRole(calendar.id(), userId).isEmpty()) {
      throw notFound();
    }
    return calendar;
  }

  public CalendarRole requireRole(Long calendarId, Long userId, CalendarRole required) {
    CalendarContext calendar = requireVisible(calendarId, userId);
    return requireRole(calendar, userId, required);
  }

  /** SYSTEM 根可作为公共挂载点；MANAGED 父级只能由其发布者向下委派继承内容。 */
  public CalendarContext requireDelegableParent(Long calendarId, Long userId) {
    CalendarContext calendar = requireVisible(calendarId, userId);
    if (calendar.kind() == CalendarKind.MANAGED) {
      requireRole(calendar, userId, CalendarRole.PUBLISHER);
    }
    return calendar;
  }

  private CalendarRole requireRole(CalendarContext calendar, Long userId, CalendarRole required) {
    if (calendar.kind() != CalendarKind.MANAGED) {
      throw new BizException(ErrorCode.FORBIDDEN);
    }
    CalendarRole actual =
        calendarContextRepository
            .findActiveRole(calendar.id(), userId)
            .orElseThrow(CalendarAccessService::notFound);
    if (!actual.includes(required)) {
      throw new BizException(ErrorCode.FORBIDDEN);
    }
    return actual;
  }

  /** 返回 SYSTEM 根到目标的稳定顺序，最多八层 MANAGED；损坏链 fail-closed。 */
  public List<CalendarContext> hierarchy(CalendarContext target) {
    List<CalendarContext> reversed = new ArrayList<>();
    Set<Long> visited = new HashSet<>();
    CalendarContext current = target;
    while (true) {
      if (!visited.add(current.id())) {
        throw hierarchyError(CalendarErrorCode.CALENDAR_HIERARCHY_INVALID);
      }
      reversed.add(current);
      if (current.kind() == CalendarKind.SYSTEM) {
        break;
      }
      if (reversed.size() > 8) {
        throw hierarchyError(CalendarErrorCode.CALENDAR_HIERARCHY_TOO_DEEP);
      }
      current =
          calendarContextRepository
              .findById(current.parentId())
              .filter(parent -> parent.regionCode().equals(target.regionCode()))
              .filter(parent -> parent.state() != CalendarState.ARCHIVED)
              .orElseThrow(() -> hierarchyError(CalendarErrorCode.CALENDAR_HIERARCHY_INVALID));
    }
    Collections.reverse(reversed);
    return List.copyOf(reversed);
  }

  private static BizException notFound() {
    return new BizException(ErrorCode.NOT_FOUND.getCode(), "日历不存在");
  }

  private static BizException hierarchyError(CalendarErrorCode error) {
    return new BizException(error.getCode(), error.getMessage());
  }
}
