package io.apocalypse.calendar.interfaces.dto.response;

public record LunarDateResp(int year, int month, int day, boolean leapMonth, String displayText) {}
