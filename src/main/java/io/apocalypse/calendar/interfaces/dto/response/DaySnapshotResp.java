package io.apocalypse.calendar.interfaces.dto.response;

import io.apocalypse.calendar.domain.SolarTerm;
import io.apocalypse.calendar.domain.Zodiac;

public record DaySnapshotResp(
    LunarDateResp lunarDate,
    Zodiac zodiac,
    SolarTerm solarTerm,
    DayPolicyResp dayPolicy,
    String displayLabel,
    String displayNote) {}
