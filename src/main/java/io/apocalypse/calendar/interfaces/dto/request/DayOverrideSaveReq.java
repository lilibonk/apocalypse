package io.apocalypse.calendar.interfaces.dto.request;

import java.util.List;

public record DayOverrideSaveReq(int expectedRevisionNo, List<DayFieldOperationReq> operations) {}
