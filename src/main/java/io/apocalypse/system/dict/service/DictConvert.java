package io.apocalypse.system.dict.service;

import io.apocalypse.system.dict.dto.response.DictDataResp;
import io.apocalypse.system.dict.dto.response.DictTypeResp;
import io.apocalypse.system.dict.entity.SysDictDataEntity;
import io.apocalypse.system.dict.entity.SysDictTypeEntity;

import org.mapstruct.Mapper;
import org.mapstruct.MappingConstants;

/** 字典域对象转换（MapStruct）。 */
@Mapper(componentModel = MappingConstants.ComponentModel.SPRING)
public interface DictConvert {

  DictTypeResp toTypeResp(SysDictTypeEntity entity);

  DictDataResp toDataResp(SysDictDataEntity entity);
}
