package io.apocalypse.calendar.domain;

/** 一个日期的系统日别结果；published=false 明确表示该年度尚未发布，而不是普通工作日。 */
public record HolidayPolicyKnowledge(boolean published, DayPolicyValue policy) {}
