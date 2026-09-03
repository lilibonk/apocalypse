package io.apocalypse.calendar.interfaces.dto.response;

import io.apocalypse.calendar.domain.CalendarMemberState;
import io.apocalypse.calendar.domain.CalendarRole;

public record CalendarMemberResp(
    Long userId,
    String username,
    String nickname,
    CalendarRole role,
    CalendarMemberState state,
    int version) {}
