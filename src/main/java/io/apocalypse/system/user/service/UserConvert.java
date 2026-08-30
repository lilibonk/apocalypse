package io.apocalypse.system.user.service;

import io.apocalypse.system.api.UserSummary;
import io.apocalypse.system.user.dto.response.UserResp;
import io.apocalypse.system.user.entity.SysUserEntity;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingConstants;

/** 用户域对象转换（MapStruct）。 */
@Mapper(componentModel = MappingConstants.ComponentModel.SPRING)
public interface UserConvert {

  /** deptName 非实体字段，由 Service 装配。 */
  @Mapping(target = "deptName", ignore = true)
  UserResp toResp(SysUserEntity entity);

  UserSummary toSummary(SysUserEntity entity);
}
