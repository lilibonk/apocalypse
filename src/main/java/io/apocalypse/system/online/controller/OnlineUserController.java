package io.apocalypse.system.online.controller;

import io.apocalypse.framework.log.OperLog;
import io.apocalypse.framework.security.AuthService;
import io.apocalypse.framework.security.OnlineUserRegistry;
import io.apocalypse.system.online.dto.response.OnlineUserResp;
import io.apocalypse.system.realtime.service.RealtimePulseHub;

import java.util.List;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;

/** 在线用户端点。所选在线条目用于确定用户名；管理员强退持久化撤销该用户全部设备的 access/refresh 令牌。 */
@RestController
@RequestMapping("/system/online-users")
@RequiredArgsConstructor
public class OnlineUserController {

  private final OnlineUserRegistry onlineUserRegistry;

  private final AuthService authService;

  private final RealtimePulseHub realtimePulseHub;

  /** 在线用户列表。 */
  @GetMapping
  @PreAuthorize("hasAuthority('system:online:list')")
  public List<OnlineUserResp> list() {
    return onlineUserRegistry.listAll().stream()
        .map(
            session ->
                new OnlineUserResp(
                    session.jti(),
                    session.user().username(),
                    session.user().loginTime(),
                    session.user().ip(),
                    session.user().userAgent()))
        .toList();
  }

  /** 按所选会话（jti）精准强退该单会话。 */
  @DeleteMapping("/{jti}")
  @PreAuthorize("hasAuthority('system:online:kick')")
  @OperLog(title = "在线用户", businessType = "FORCE")
  public void kick(@PathVariable String jti) {
    authService.kickUser(jti);
    realtimePulseHub.broadcast("onlineChanged");
  }

  /** 强退指定用户的全部设备会话（递增数据库凭证版本并清理全部在线条目）。 */
  @DeleteMapping("/user/{username}")
  @PreAuthorize("hasAuthority('system:online:kick')")
  @OperLog(title = "在线用户", businessType = "FORCE")
  public void kickAllByUsername(@PathVariable String username) {
    authService.revokeAllSessions(username);
    realtimePulseHub.broadcast("onlineChanged");
  }
}
