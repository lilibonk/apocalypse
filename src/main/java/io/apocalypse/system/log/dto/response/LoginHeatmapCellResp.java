package io.apocalypse.system.log.dto.response;

/** 星期×小时热力格。{@code isoWeekday} 1=周一…7=周日；{@code slots} 为该格在有效窗口内出现的小时数， 为 0 表示未覆盖（区别于记录为零）。 */
public record LoginHeatmapCellResp(int isoWeekday, int hour, long total, long failed, int slots) {}
