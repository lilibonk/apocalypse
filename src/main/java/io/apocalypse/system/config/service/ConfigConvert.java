package io.apocalypse.system.config.service;

import io.apocalypse.system.config.dto.response.ConfigResp;
import io.apocalypse.system.config.entity.SysConfigEntity;

import org.mapstruct.Mapper;
import org.mapstruct.MappingConstants;

/** 参数配置对象转换（MapStruct）。 */
@Mapper(componentModel = MappingConstants.ComponentModel.SPRING)
public interface ConfigConvert {

  ConfigResp toResp(SysConfigEntity entity);
}
