package io.apocalypse.calendar.infrastructure.persistence;

import io.apocalypse.calendar.domain.CalendarContext;
import io.apocalypse.calendar.domain.CalendarContextRepository;
import io.apocalypse.calendar.domain.CalendarKind;
import io.apocalypse.calendar.domain.CalendarRole;
import io.apocalypse.calendar.domain.CalendarState;
import io.apocalypse.common.exception.ConcurrencyGuard;

import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Repository;

import lombok.RequiredArgsConstructor;

@Repository
@RequiredArgsConstructor
public class MybatisCalendarContextRepository implements CalendarContextRepository {

  private final CalendarMapper calendarMapper;

  private final CalendarMemberMapper calendarMemberMapper;

  @Override
  public CalendarContext save(CalendarContext context) {
    CalendarDo value = toDo(context);
    if (value.getId() == null) {
      calendarMapper.insert(value);
      context.assignId(value.getId());
    } else {
      ConcurrencyGuard.requireSingleRow(calendarMapper.updateById(value));
    }
    return context;
  }

  @Override
  public Optional<CalendarContext> findById(Long id) {
    return Optional.ofNullable(calendarMapper.selectById(id)).map(this::toDomain);
  }

  @Override
  public Optional<CalendarContext> findByKey(String calendarKey) {
    return Optional.ofNullable(calendarMapper.selectByKey(calendarKey)).map(this::toDomain);
  }

  @Override
  public Optional<CalendarContext> findSystemByRegion(String regionCode) {
    return Optional.ofNullable(calendarMapper.selectSystemByRegion(regionCode)).map(this::toDomain);
  }

  @Override
  public List<CalendarContext> findVisibleByUserId(Long userId) {
    return calendarMapper.selectVisibleByUserId(userId).stream().map(this::toDomain).toList();
  }

  @Override
  public Optional<CalendarRole> findActiveRole(Long calendarId, Long userId) {
    CalendarMemberDo member = calendarMemberMapper.selectActive(calendarId, userId);
    return member == null ? Optional.empty() : Optional.of(CalendarRole.valueOf(member.getRole()));
  }

  @Override
  public void lockHierarchy(String regionCode) {
    calendarMapper.lockHierarchy(regionCode);
  }

  @Override
  public int descendantDepth(Long calendarId) {
    return calendarMapper.selectDescendantDepth(calendarId);
  }

  private CalendarContext toDomain(CalendarDo value) {
    return CalendarContext.rehydrate(
        value.getId(),
        value.getCalendarKey(),
        CalendarKind.valueOf(value.getKind()),
        value.getParentId(),
        value.getName(),
        value.getRegionCode(),
        value.getZoneId(),
        CalendarState.valueOf(value.getState()),
        value.getVersion());
  }

  private static CalendarDo toDo(CalendarContext context) {
    CalendarDo value = new CalendarDo();
    value.setId(context.id());
    value.setCalendarKey(context.calendarKey());
    value.setKind(context.kind().name());
    value.setParentId(context.parentId());
    value.setName(context.name());
    value.setRegionCode(context.regionCode());
    value.setZoneId(context.zoneId());
    value.setState(context.state().name());
    value.setVersion(context.version());
    return value;
  }
}
