package io.apocalypse.calendar.interfaces.dto.response;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.List;

public record EffectiveDayResp(
    LocalDate date,
    DayOfWeek dayOfWeek,
    Long calendarId,
    String calendarKey,
    String zoneId,
    BaselineRefResp baselineRef,
    DaySnapshotResp baseline,
    DaySnapshotResp effective,
    List<FieldResolutionResp> resolutions) {}
