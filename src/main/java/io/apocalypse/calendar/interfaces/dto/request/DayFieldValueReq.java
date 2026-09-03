package io.apocalypse.calendar.interfaces.dto.request;

import io.apocalypse.calendar.domain.SolarTerm;
import io.apocalypse.calendar.domain.Zodiac;

public record DayFieldValueReq(
    LunarDateReq lunarDate,
    Zodiac zodiac,
    SolarTerm solarTerm,
    DayPolicyReq dayPolicy,
    String text) {}
