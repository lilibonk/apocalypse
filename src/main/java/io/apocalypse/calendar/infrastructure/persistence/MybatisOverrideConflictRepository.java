package io.apocalypse.calendar.infrastructure.persistence;

import io.apocalypse.calendar.domain.OverrideConflictCreate;
import io.apocalypse.calendar.domain.OverrideConflictRecordState;
import io.apocalypse.calendar.domain.OverrideConflictRepository;
import io.apocalypse.calendar.domain.OverrideConflictSnapshot;
import io.apocalypse.calendar.domain.OverrideConflictTrigger;
import io.apocalypse.calendar.domain.OverrideScope;
import io.apocalypse.common.exception.ConcurrencyGuard;
import io.apocalypse.common.response.PageResult;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Repository;

import com.baomidou.mybatisplus.core.toolkit.IdWorker;

import lombok.RequiredArgsConstructor;

@Repository
@RequiredArgsConstructor
public class MybatisOverrideConflictRepository implements OverrideConflictRepository {

  private final OverrideConflictMapper mapper;

  private final DayFieldValueJsonCodec valueJsonCodec;

  @Override
  public Optional<OverrideConflictSnapshot> findLatestForItem(Long overrideItemId) {
    return Optional.ofNullable(mapper.selectLatestForItem(overrideItemId)).map(this::toSnapshot);
  }

  @Override
  public Map<Long, OverrideConflictSnapshot> findLatestForItems(List<Long> overrideItemIds) {
    if (overrideItemIds.isEmpty()) {
      return Map.of();
    }
    return mapper.selectLatestForItems(overrideItemIds).stream()
        .map(this::toSnapshot)
        .collect(
            Collectors.toUnmodifiableMap(
                OverrideConflictSnapshot::overrideItemId, Function.identity()));
  }

  @Override
  public void create(OverrideConflictCreate conflict) {
    OverrideConflictDo value = new OverrideConflictDo();
    value.setId(IdWorker.getId());
    value.setOverrideItemId(conflict.overrideItemId());
    value.setTriggerType(conflict.triggerType().name());
    value.setTriggerKey(conflict.triggerKey());
    value.setPreviousUnderlayJson(valueJsonCodec.write(conflict.previousUnderlay()));
    value.setCurrentUnderlayJson(valueJsonCodec.write(conflict.currentUnderlay()));
    value.setPreviousHash(conflict.previousHash());
    value.setCurrentHash(conflict.currentHash());
    mapper.insertJson(value, conflict.actor());
  }

  @Override
  public PageResult<OverrideConflictSnapshot> pageCurrent(
      Long calendarId, OverrideScope scope, Long ownerUserId, int page, int size) {
    long total = mapper.countCurrent(calendarId, scope.name(), ownerUserId);
    List<OverrideConflictSnapshot> values =
        mapper
            .selectCurrentPage(
                calendarId, scope.name(), ownerUserId, size, (long) (page - 1) * size)
            .stream()
            .map(this::toSnapshot)
            .toList();
    return new PageResult<>(values, total, page, size);
  }

  @Override
  public List<OverrideConflictSnapshot> findOpenCurrent(
      Long calendarId, OverrideScope scope, Long ownerUserId) {
    return mapper.selectOpenCurrent(calendarId, scope.name(), ownerUserId).stream()
        .map(this::toSnapshot)
        .toList();
  }

  @Override
  public Optional<OverrideConflictSnapshot> findCurrentById(
      Long conflictId, Long calendarId, OverrideScope scope, Long ownerUserId) {
    return Optional.ofNullable(
            mapper.selectCurrentById(conflictId, calendarId, scope.name(), ownerUserId))
        .map(this::toSnapshot);
  }

  @Override
  public void resolve(
      Long conflictId, OverrideConflictRecordState state, Long resolutionRevisionId, String actor) {
    ConcurrencyGuard.requireSingleRow(
        mapper.resolve(conflictId, state.name(), resolutionRevisionId, actor));
  }

  private OverrideConflictSnapshot toSnapshot(OverrideConflictDo value) {
    return new OverrideConflictSnapshot(
        value.getId(),
        value.getOverrideItemId(),
        value.getRevisionId(),
        value.getCalendarId(),
        value.getScopeType() == null ? null : OverrideScope.valueOf(value.getScopeType()),
        value.getOwnerUserId(),
        value.getLocalDate(),
        value.getFieldKey() == null
            ? null
            : io.apocalypse.calendar.domain.DayField.valueOf(value.getFieldKey()),
        OverrideConflictTrigger.valueOf(value.getTriggerType()),
        value.getTriggerKey(),
        valueJsonCodec.read(value.getPreviousUnderlayJson()),
        valueJsonCodec.read(value.getCurrentUnderlayJson()),
        value.getPreviousHash(),
        value.getCurrentHash(),
        OverrideConflictRecordState.valueOf(value.getState()),
        value.getDetectedAt(),
        value.getResolvedAt(),
        value.getResolvedBy(),
        value.getResolutionRevisionId());
  }
}
