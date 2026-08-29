package io.apocalypse.system.online.controller;

import io.apocalypse.framework.log.OperLog;
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

/**
 * 在线用户端点。数据来自 framework 在线注册表（{@code apoc:online:{jti}}）； 强退 = 删在线条目 + jti 写入黑名单（JwtBlacklistFilter
 * 逐请求拦截）。
 */
@RestController
@RequestMapping("/system/online-users")
@RequiredArgsConstructor
public class OnlineUserController {

  private final OnlineUserRegistry onlineUserRegistry;

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

  /** 强退指定会话（jti）。 */
  @DeleteMapping("/{jti}")
  @PreAuthorize("hasAuthority('system:online:kick')")
  @OperLog(title = "在线用户", businessType = "FORCE")
  public void kick(@PathVariable String jti) {
    onlineUserRegistry.kick(jti);
  }
}
