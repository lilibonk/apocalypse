package io.apocalypse.system.log.service;

import io.apocalypse.system.log.dto.response.LoginLogResp;
import io.apocalypse.system.log.dto.response.OperLogResp;
import io.apocalypse.system.log.entity.SysLoginLogEntity;
import io.apocalypse.system.log.entity.SysOperLogEntity;

import org.mapstruct.Mapper;
import org.mapstruct.MappingConstants;

/** 日志对象转换（MapStruct）。 */
@Mapper(componentModel = MappingConstants.ComponentModel.SPRING)
public interface LogConvert {

  LoginLogResp toLoginLogResp(SysLoginLogEntity entity);

  OperLogResp toOperLogResp(SysOperLogEntity entity);
}
