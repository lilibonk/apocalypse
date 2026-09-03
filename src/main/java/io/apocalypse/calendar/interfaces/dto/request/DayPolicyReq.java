package io.apocalypse.calendar.interfaces.dto.request;

import io.apocalypse.calendar.domain.DayClassification;

public record DayPolicyReq(DayClassification classification, String name) {}
