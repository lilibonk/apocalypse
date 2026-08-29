package io.apocalypse.system.role.service;

import io.apocalypse.system.role.dto.response.RoleResp;
import io.apocalypse.system.role.entity.SysRoleEntity;

import org.mapstruct.Mapper;
import org.mapstruct.MappingConstants;

/** 角色域对象转换（MapStruct）。 */
@Mapper(componentModel = MappingConstants.ComponentModel.SPRING)
public interface RoleConvert {

  RoleResp toResp(SysRoleEntity entity);
}
