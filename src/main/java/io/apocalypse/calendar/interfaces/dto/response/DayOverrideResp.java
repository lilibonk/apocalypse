package io.apocalypse.calendar.interfaces.dto.response;

import io.apocalypse.calendar.domain.DayField;
import io.apocalypse.calendar.domain.OverrideAction;

import java.time.LocalDate;

public record DayOverrideResp(
    Long id,
    LocalDate date,
    DayField field,
    OverrideAction action,
    DayFieldValueResp value,
    DayFieldValueResp savedUnderlay,
    String savedUnderlayHash,
    ResolutionSourceResp savedUnderlaySource) {}
