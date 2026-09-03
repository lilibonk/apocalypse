package io.apocalypse.calendar.domain;

import java.util.Objects;

/** Calendar 上下文聚合；层级无环/深度和父地区一致性由应用服务在事务锁内验证。 */
public class CalendarContext {

  private Long id;

  private final String calendarKey;

  private final CalendarKind kind;

  private Long parentId;

  private String name;

  private final String regionCode;

  private String zoneId;

  private CalendarState state;

  private Integer version;

  private CalendarContext(
      Long id,
      String calendarKey,
      CalendarKind kind,
      Long parentId,
      String name,
      String regionCode,
      String zoneId,
      CalendarState state,
      Integer version) {
    this.id = id;
    this.calendarKey = calendarKey;
    this.kind = kind;
    this.parentId = parentId;
    this.name = name;
    this.regionCode = regionCode;
    this.zoneId = zoneId;
    this.state = state;
    this.version = version;
  }

  public static CalendarContext managed(
      String calendarKey, Long parentId, String name, String regionCode, String zoneId) {
    return new CalendarContext(
        null,
        Objects.requireNonNull(calendarKey),
        CalendarKind.MANAGED,
        Objects.requireNonNull(parentId),
        Objects.requireNonNull(name),
        Objects.requireNonNull(regionCode),
        Objects.requireNonNull(zoneId),
        CalendarState.ACTIVE,
        0);
  }

  public static CalendarContext rehydrate(
      Long id,
      String calendarKey,
      CalendarKind kind,
      Long parentId,
      String name,
      String regionCode,
      String zoneId,
      CalendarState state,
      Integer version) {
    return new CalendarContext(
        id, calendarKey, kind, parentId, name, regionCode, zoneId, state, version);
  }

  public void update(Long parentId, String name, String zoneId, CalendarState state) {
    if (kind == CalendarKind.SYSTEM) {
      throw new IllegalStateException("SYSTEM 根日历不可修改");
    }
    this.parentId = Objects.requireNonNull(parentId);
    this.name = Objects.requireNonNull(name);
    this.zoneId = Objects.requireNonNull(zoneId);
    this.state = Objects.requireNonNull(state);
  }

  public void archive() {
    if (kind == CalendarKind.SYSTEM) {
      throw new IllegalStateException("SYSTEM 根日历不可归档");
    }
    state = CalendarState.ARCHIVED;
  }

  public void assignId(Long id) {
    this.id = id;
  }

  public Long id() {
    return id;
  }

  public String calendarKey() {
    return calendarKey;
  }

  public CalendarKind kind() {
    return kind;
  }

  public Long parentId() {
    return parentId;
  }

  public String name() {
    return name;
  }

  public String regionCode() {
    return regionCode;
  }

  public String zoneId() {
    return zoneId;
  }

  public CalendarState state() {
    return state;
  }

  public Integer version() {
    return version;
  }
}
