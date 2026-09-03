package io.apocalypse.calendar.infrastructure.persistence;

import io.apocalypse.calendar.domain.CalendarMemberRepository;
import io.apocalypse.calendar.domain.CalendarMemberSnapshot;
import io.apocalypse.calendar.domain.CalendarMemberState;
import io.apocalypse.calendar.domain.CalendarRole;
import io.apocalypse.common.exception.ConcurrencyGuard;
import io.apocalypse.common.response.PageResult;

import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Repository;

import lombok.RequiredArgsConstructor;

@Repository
@RequiredArgsConstructor
public class MybatisCalendarMemberRepository implements CalendarMemberRepository {

  private final CalendarMemberMapper mapper;

  @Override
  public Optional<CalendarMemberSnapshot> findActive(Long calendarId, Long userId) {
    return Optional.ofNullable(mapper.selectActive(calendarId, userId)).map(this::toSnapshot);
  }

  @Override
  public CalendarMemberSnapshot save(CalendarMemberSnapshot member) {
    CalendarMemberDo value = toDo(member);
    if (value.getId() == null) {
      mapper.insert(value);
    } else {
      ConcurrencyGuard.requireSingleRow(mapper.updateById(value));
    }
    return toSnapshot(value);
  }

  @Override
  public void delete(CalendarMemberSnapshot member) {
    ConcurrencyGuard.requireSingleRow(mapper.deleteWithVersion(member.id(), member.version()));
  }

  @Override
  public List<CalendarMemberSnapshot> lockActiveMembers(Long calendarId) {
    return mapper.selectActiveForUpdate(calendarId).stream().map(this::toSnapshot).toList();
  }

  @Override
  public PageResult<CalendarMemberSnapshot> pageActive(Long calendarId, int page, int size) {
    return PageResult.of(mapper.selectActivePage(calendarId, page, size), this::toSnapshot);
  }

  private CalendarMemberSnapshot toSnapshot(CalendarMemberDo value) {
    return new CalendarMemberSnapshot(
        value.getId(),
        value.getCalendarId(),
        value.getUserId(),
        CalendarRole.valueOf(value.getRole()),
        CalendarMemberState.valueOf(value.getState()),
        value.getVersion());
  }

  private static CalendarMemberDo toDo(CalendarMemberSnapshot member) {
    CalendarMemberDo value = new CalendarMemberDo();
    value.setId(member.id());
    value.setCalendarId(member.calendarId());
    value.setUserId(member.userId());
    value.setRole(member.role().name());
    value.setState(member.state().name());
    value.setVersion(member.version());
    return value;
  }
}
