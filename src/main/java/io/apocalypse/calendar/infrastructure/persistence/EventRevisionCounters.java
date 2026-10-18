package io.apocalypse.calendar.infrastructure.persistence;

/** 保留全部历史（含已删除草稿）的修订计数；只能在持有事件行锁时用于分配下一版本。 */
public record EventRevisionCounters(int revisionNo, int version) {}
