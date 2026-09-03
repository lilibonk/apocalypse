package io.apocalypse.calendar.domain;

/** 农历年月日值；闰月与月份数字分离，避免第三方库的负月份约定向上泄漏。 */
public record LunarDateValue(int year, int month, int day, boolean leapMonth, String displayText) {}
