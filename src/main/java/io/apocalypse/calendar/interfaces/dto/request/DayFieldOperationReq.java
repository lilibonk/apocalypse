package io.apocalypse.calendar.interfaces.dto.request;

import io.apocalypse.calendar.domain.DayField;
import io.apocalypse.calendar.domain.OverrideAction;

public record DayFieldOperationReq(DayField field, OverrideAction action, DayFieldValueReq value) {}
