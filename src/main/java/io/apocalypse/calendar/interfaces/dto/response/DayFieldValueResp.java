package io.apocalypse.calendar.interfaces.dto.response;

import io.apocalypse.calendar.domain.DayField;
import io.apocalypse.calendar.domain.FieldValueState;
import io.apocalypse.calendar.domain.SolarTerm;
import io.apocalypse.calendar.domain.Zodiac;

public record DayFieldValueResp(
    DayField field,
    LunarDateResp lunarDate,
    Zodiac zodiac,
    SolarTerm solarTerm,
    DayPolicyResp dayPolicy,
    String text,
    FieldValueState state) {}
