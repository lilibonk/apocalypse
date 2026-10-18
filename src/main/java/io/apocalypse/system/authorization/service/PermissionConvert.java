package io.apocalypse.system.authorization.service;

import io.apocalypse.system.authorization.dto.response.PermissionDefinitionResp;
import io.apocalypse.system.authorization.entity.SysPermissionEntity;

import java.util.List;

import org.mapstruct.Mapper;
import org.mapstruct.MappingConstants;

@Mapper(componentModel = MappingConstants.ComponentModel.SPRING)
public interface PermissionConvert {
  PermissionDefinitionResp toResp(
      SysPermissionEntity entity,
      List<String> supportedScopeOverrides,
      boolean registered,
      Long referenceRoleCount);
}
