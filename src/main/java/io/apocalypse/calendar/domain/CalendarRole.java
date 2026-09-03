package io.apocalypse.calendar.domain;

/** 范围角色按枚举顺序递增：PUBLISHER 包含 EDITOR，EDITOR 包含 READER。 */
public enum CalendarRole {
  READER,
  EDITOR,
  PUBLISHER;

  public boolean includes(CalendarRole required) {
    return ordinal() >= required.ordinal();
  }
}
