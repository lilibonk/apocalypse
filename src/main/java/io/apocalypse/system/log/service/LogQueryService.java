package io.apocalypse.system.log.service;

import io.apocalypse.common.response.PageResult;
import io.apocalypse.system.log.dto.response.LoginLogResp;
import io.apocalypse.system.log.dto.response.OperLogResp;
import io.apocalypse.system.log.mapper.SysLoginLogMapper;
import io.apocalypse.system.log.mapper.SysOperLogMapper;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

/** 日志查询服务：登录/操作日志分页（写入走事件驱动落库，见 listener.LogPersistListener）。 */
@Service
@RequiredArgsConstructor
public class LogQueryService {

  private final SysLoginLogMapper sysLoginLogMapper;

  private final SysOperLogMapper sysOperLogMapper;

  private final LogConvert logConvert;

  /** 登录日志分页。 */
  public PageResult<LoginLogResp> pageLoginLog(int page, int size, String keyword) {
    return sysLoginLogMapper.pageByKeyword(page, size, keyword).map(logConvert::toLoginLogResp);
  }

  /** 操作日志分页。 */
  public PageResult<OperLogResp> pageOperLog(int page, int size, String keyword) {
    return sysOperLogMapper.pageByKeyword(page, size, keyword).map(logConvert::toOperLogResp);
  }
}
