package io.apocalypse.system.listener;

import io.apocalypse.common.event.AuditTextSanitizer;
import io.apocalypse.common.event.LoginFailedEvent;
import io.apocalypse.common.event.LoginSucceededEvent;
import io.apocalypse.common.event.OperLoggedEvent;
import io.apocalypse.system.log.entity.SysLoginLogEntity;
import io.apocalypse.system.log.entity.SysOperLogEntity;
import io.apocalypse.system.log.mapper.SysLoginLogMapper;
import io.apocalypse.system.log.mapper.SysOperLogMapper;

import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

/**
 * 日志落库监听（AGENTS.md 约定：登录/操作日志一律事件驱动——framework 发事件、本域监听落库）。 {@code @ApplicationModuleListener} =
 * 事务提交后异步消费 + event_publication 留痕。监听器不吞异常：失败事件保持未完成并由 Modulith 重投；日志表以 event_id 唯一键保证重复投递幂等。
 */
@Component
@RequiredArgsConstructor
public class LogPersistListener {

  private final SysLoginLogMapper sysLoginLogMapper;

  private final SysOperLogMapper sysOperLogMapper;

  /** 登录成功落 sys_login_log。 */
  @ApplicationModuleListener
  public void onLoginSucceeded(LoginSucceededEvent event) {
    SysLoginLogEntity entity = new SysLoginLogEntity();
    entity.setEventId(event.eventId() == null ? null : event.eventId().toString());
    entity.setUsername(
        AuditTextSanitizer.fit(event.username(), AuditTextSanitizer.USERNAME_MAX_LENGTH));
    entity.setIp(AuditTextSanitizer.fit(event.ip(), AuditTextSanitizer.IP_MAX_LENGTH));
    entity.setUserAgent(
        AuditTextSanitizer.fit(event.userAgent(), AuditTextSanitizer.USER_AGENT_MAX_LENGTH));
    entity.setSuccess(1);
    entity.setMessage("登录成功");
    entity.setLoginTime(event.occurredAt());
    sysLoginLogMapper.insertIdempotent(entity);
  }

  /** 登录失败落 sys_login_log。 */
  @ApplicationModuleListener
  public void onLoginFailed(LoginFailedEvent event) {
    SysLoginLogEntity entity = new SysLoginLogEntity();
    entity.setEventId(event.eventId() == null ? null : event.eventId().toString());
    entity.setUsername(
        AuditTextSanitizer.fit(event.username(), AuditTextSanitizer.USERNAME_MAX_LENGTH));
    entity.setIp(AuditTextSanitizer.fit(event.ip(), AuditTextSanitizer.IP_MAX_LENGTH));
    entity.setUserAgent(
        AuditTextSanitizer.fit(event.userAgent(), AuditTextSanitizer.USER_AGENT_MAX_LENGTH));
    entity.setSuccess(0);
    entity.setMessage(
        AuditTextSanitizer.fit(event.message(), AuditTextSanitizer.MESSAGE_MAX_LENGTH));
    entity.setLoginTime(event.occurredAt());
    sysLoginLogMapper.insertIdempotent(entity);
  }

  /** 操作日志落 sys_oper_log（参数已在 framework 切面脱敏）。 */
  @ApplicationModuleListener
  public void onOperLogged(OperLoggedEvent event) {
    SysOperLogEntity entity = new SysOperLogEntity();
    entity.setEventId(event.eventId() == null ? null : event.eventId().toString());
    entity.setTitle(
        AuditTextSanitizer.fit(event.title(), AuditTextSanitizer.OPER_TITLE_MAX_LENGTH));
    entity.setBusinessType(
        AuditTextSanitizer.fit(event.businessType(), AuditTextSanitizer.BUSINESS_TYPE_MAX_LENGTH));
    entity.setMethod(AuditTextSanitizer.fit(event.method(), AuditTextSanitizer.METHOD_MAX_LENGTH));
    entity.setOperName(
        AuditTextSanitizer.fit(event.operName(), AuditTextSanitizer.OPER_NAME_MAX_LENGTH));
    entity.setOperIp(AuditTextSanitizer.fit(event.operIp(), AuditTextSanitizer.IP_MAX_LENGTH));
    entity.setOperParam(
        AuditTextSanitizer.fit(event.operParam(), AuditTextSanitizer.OPER_PAYLOAD_MAX_LENGTH));
    entity.setOperResult(
        AuditTextSanitizer.fit(event.operResult(), AuditTextSanitizer.OPER_PAYLOAD_MAX_LENGTH));
    entity.setStatus(event.status());
    entity.setErrorMsg(
        AuditTextSanitizer.fit(event.errorMsg(), AuditTextSanitizer.ERROR_MESSAGE_MAX_LENGTH));
    entity.setCostTime(event.costTime());
    entity.setOperTime(event.occurredAt());
    sysOperLogMapper.insertIdempotent(entity);
  }
}
