package io.apocalypse.calendar.interfaces.dto.response;

import java.time.LocalDate;
import java.util.List;

public record BaselineRefResp(
    String regionCode,
    String releaseKey,
    String providerKey,
    String providerVersion,
    LocalDate supportedFrom,
    LocalDate supportedTo,
    List<Integer> publishedHolidayYears) {}
