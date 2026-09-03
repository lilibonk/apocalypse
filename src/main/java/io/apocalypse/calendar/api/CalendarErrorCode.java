package io.apocalypse.calendar.api;

import lombok.Getter;

/** Calendar 模块稳定业务错误码（11000–11019）。 */
@Getter
public enum CalendarErrorCode {
  CALENDAR_DISABLED(11000, "万年历能力未启用"),
  CALENDAR_HIERARCHY_INVALID(11001, "日历层级无效"),
  CALENDAR_HIERARCHY_TOO_DEEP(11002, "日历层级超过上限"),
  CALENDAR_TIME_ZONE_INVALID(11003, "时区无效"),
  CALENDAR_LOCAL_TIME_GAP(11004, "本地时间位于夏令时空档"),
  CALENDAR_LOCAL_TIME_AMBIGUOUS(11005, "本地时间存在夏令时歧义"),
  CALENDAR_REVISION_STATE_INVALID(11006, "修订状态不允许当前操作"),
  CALENDAR_OVERRIDE_VALUE_INVALID(11007, "日期覆盖值无效"),
  CALENDAR_CONFLICT_REVIEW_REQUIRED(11008, "存在尚未复核的覆盖冲突"),
  CALENDAR_PROJECTION_NOT_GRANTED(11009, "事件投影来源未获授权"),
  CALENDAR_PROJECTION_VERSION_CONFLICT(11010, "事件投影版本内容冲突"),
  CALENDAR_BATCH_LIMIT_EXCEEDED(11011, "批量操作超过上限"),
  CALENDAR_EVENT_TIME_INVALID(11012, "日程时间范围无效"),
  CALENDAR_LAST_PUBLISHER_REQUIRED(11013, "托管日历必须保留至少一名发布者"),
  CALENDAR_SOURCE_MANAGED_EVENT(11014, "投影日程只能由来源系统修改"),
  CALENDAR_BASELINE_UNAVAILABLE(11015, "日期基线不可用"),
  CALENDAR_IMPORT_FORMAT_INVALID(11016, "导入文件格式无效"),
  CALENDAR_IMPORT_SOURCE_EVIDENCE_REQUIRED(11017, "系统基线缺少可审核的官方来源证据"),
  CALENDAR_IMPORT_STATE_INVALID(11018, "导入状态不允许当前操作"),
  CALENDAR_IMPORT_SCOPE_INVALID(11019, "导入目标或来源范围无效");

  private final int code;

  private final String message;

  CalendarErrorCode(int code, String message) {
    this.code = code;
    this.message = message;
  }
}
