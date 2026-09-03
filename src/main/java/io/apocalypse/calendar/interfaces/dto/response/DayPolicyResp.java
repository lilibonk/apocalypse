package io.apocalypse.calendar.interfaces.dto.response;

import io.apocalypse.calendar.domain.DayClassification;

public record DayPolicyResp(DayClassification classification, String name) {}
