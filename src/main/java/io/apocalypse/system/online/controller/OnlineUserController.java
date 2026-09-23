package io.apocalypse.system.online.controller;

import io.apocalypse.framework.log.OperLog;
import io.apocalypse.framework.security.AuthService;
import io.apocalypse.framework.security.OnlineUserRegistry;
import io.apocalypse.system.online.dto.response.OnlineUserResp;

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

  /** 按所选会话（jti）确定用户，并强退该用户全部设备。 */
  @DeleteMapping("/{jti}")
  @PreAuthorize("hasAuthority('system:online:kick')")
  @OperLog(title = "在线用户", businessType = "FORCE")
  public void kick(@PathVariable String jti) {
    authService.kickUser(jti);
  }
}
