package io.apocalypse.system.log.service;

import io.apocalypse.common.response.PageResult;
import io.apocalypse.system.log.dto.response.LoginLogResp;
import io.apocalypse.system.log.dto.response.OperLogResp;
import io.apocalypse.system.log.mapper.SysLoginLogMapper;
import io.apocalypse.system.log.mapper.SysOperLogMapper;

import java.time.LocalDateTime;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

/** 日志查询服务：登录/操作日志分页（写入走事件驱动落库，见 listener.LogPersistListener）。 */
@Service
@RequiredArgsConstructor
public class LogQueryService {

  private final SysLoginLogMapper sysLoginLogMapper;

  private final SysOperLogMapper sysOperLogMapper;

  private final LogConvert logConvert;

  private final LogInsightService logInsightService;

  /** 登录日志分页。 */
  public PageResult<LoginLogResp> pageLoginLog(int page, int size, String keyword) {
    return pageLoginLog(page, size, keyword, null, null, null, null, null, null);
  }

  /** 登录日志多维钻取分页。 */
  public PageResult<LoginLogResp> pageLoginLog(
      int page,
      int size,
      String keyword,
      Integer success,
      Integer isoWeekday,
      Integer hour,
      LogInsightRange range,
      LocalDateTime bucketFrom,
      LocalDateTime bucketTo) {
    LocalDateTime from = bucketFrom;
    LocalDateTime to = bucketTo;
    if (range != null) {
      LogInsightService.TimeWindow window = logInsightService.resolveTimeWindow(range);
      if (from == null || from.isBefore(window.from())) {
        from = window.from();
      }
      if (to == null || to.isAfter(window.to())) {
        to = window.to();
      }
    }
    return sysLoginLogMapper
        .pageByFilters(page, size, keyword, success, from, to, isoWeekday, hour)
        .map(logConvert::toLoginLogResp);
  }

  /** 操作日志分页。 */
  public PageResult<OperLogResp> pageOperLog(int page, int size, String keyword) {
    return pageOperLog(page, size, keyword, null, null, null, null, null);
  }

  /** 操作日志多维脉冲钻取分页。 */
  public PageResult<OperLogResp> pageOperLog(
      int page,
      int size,
      String keyword,
      String businessType,
      Integer status,
      LogInsightRange range,
      LocalDateTime bucketFrom,
      LocalDateTime bucketTo) {
    LocalDateTime from = bucketFrom;
    LocalDateTime to = bucketTo;
    if (range != null) {
      LogInsightService.TimeWindow window = logInsightService.resolveTimeWindow(range);
      if (from == null || from.isBefore(window.from())) {
        from = window.from();
      }
      if (to == null || to.isAfter(window.to())) {
        to = window.to();
      }
    }
    return sysOperLogMapper
        .pageByFilters(page, size, keyword, businessType, status, from, to)
        .map(logConvert::toOperLogResp);
  }
}
