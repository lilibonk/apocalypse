package io.apocalypse.system.listener;

import io.apocalypse.common.event.LoginFailedEvent;
import io.apocalypse.common.event.LoginSucceededEvent;
import io.apocalypse.common.event.OperLoggedEvent;
import io.apocalypse.system.log.entity.SysLoginLogEntity;
import io.apocalypse.system.log.entity.SysOperLogEntity;
import io.apocalypse.system.log.mapper.SysLoginLogMapper;
import io.apocalypse.system.log.mapper.SysOperLogMapper;

import java.time.LocalDateTime;

import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * 日志落库监听（AGENTS.md 约定：登录/操作日志一律事件驱动——framework 发事件、本域监听落库）。 {@code @ApplicationModuleListener} =
 * 事务提交后异步消费 + event_publication 留痕；注意消费需幂等（事件可能重投， 日志追加天然幂等）。落库失败不影响主流程（异步线程内异常仅记日志）。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class LogPersistListener {

  private final SysLoginLogMapper sysLoginLogMapper;

  private final SysOperLogMapper sysOperLogMapper;

  /** 登录成功落 sys_login_log。 */
  @ApplicationModuleListener
  public void onLoginSucceeded(LoginSucceededEvent event) {
    insertLoginLog(event.username(), event.ip(), event.userAgent(), 1, "登录成功");
  }

  /** 登录失败落 sys_login_log。 */
  @ApplicationModuleListener
  public void onLoginFailed(LoginFailedEvent event) {
    insertLoginLog(event.username(), event.ip(), event.userAgent(), 0, event.message());
  }

  /** 操作日志落 sys_oper_log（参数已在 framework 切面脱敏）。 */
  @ApplicationModuleListener
  public void onOperLogged(OperLoggedEvent event) {
    try {
      SysOperLogEntity entity = new SysOperLogEntity();
      entity.setTitle(event.title());
      entity.setBusinessType(event.businessType());
      entity.setMethod(event.method());
      entity.setOperName(event.operName());
      entity.setOperIp(event.operIp());
      entity.setOperParam(event.operParam());
      entity.setOperResult(event.operResult());
      entity.setStatus(event.status());
      entity.setErrorMsg(event.errorMsg());
      entity.setCostTime(event.costTime());
      entity.setOperTime(LocalDateTime.now());
      sysOperLogMapper.insert(entity);
    } catch (Exception e) {
      log.error("操作日志落库失败: {}", e.getMessage(), e);
    }
  }

  private void insertLoginLog(
      String username, String ip, String userAgent, int success, String message) {
    try {
      SysLoginLogEntity entity = new SysLoginLogEntity();
      entity.setUsername(username);
      entity.setIp(ip);
      entity.setUserAgent(userAgent);
      entity.setSuccess(success);
      entity.setMessage(message);
      entity.setLoginTime(LocalDateTime.now());
      sysLoginLogMapper.insert(entity);
    } catch (Exception e) {
      log.error("登录日志落库失败: {}", e.getMessage(), e);
    }
  }
}
