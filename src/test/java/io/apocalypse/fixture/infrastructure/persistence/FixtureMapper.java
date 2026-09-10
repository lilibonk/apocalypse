package io.apocalypse.fixture.infrastructure.persistence;

import org.apache.ibatis.annotations.Select;

public interface FixtureMapper {
  @Select("SELECT 1")
  int status();
}
