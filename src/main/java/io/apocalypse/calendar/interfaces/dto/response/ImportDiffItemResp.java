package io.apocalypse.calendar.interfaces.dto.response;

import io.apocalypse.calendar.domain.DayClassification;
import io.apocalypse.calendar.domain.OverrideAction;

import java.time.LocalDate;

public record ImportDiffItemResp(
    LocalDate date,
    String changeType,
    OverrideAction oldAction,
    DayClassification oldClassification,
    String oldName,
    OverrideAction newAction,
    DayClassification newClassification,
    String newName) {}
