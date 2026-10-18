package io.apocalypse.framework.security;

import java.util.List;
import java.util.TreeSet;

/** 一次授权点产生的不可变部门集合；与后续授权点求交只会收紧。 */
public record AuthorizationScope(boolean all, List<Long> departmentIds) {
  public AuthorizationScope {
    departmentIds = all ? List.of() : List.copyOf(new TreeSet<>(departmentIds));
  }

  public AuthorizationScope intersect(AuthorizationScope other) {
    if (all) {
      return other;
    }
    if (other.all()) {
      return this;
    }
    return new AuthorizationScope(
        false, departmentIds.stream().filter(other.departmentIds()::contains).toList());
  }
}
