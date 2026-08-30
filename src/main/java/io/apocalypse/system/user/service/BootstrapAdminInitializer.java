package io.apocalypse.system.user.service;

import io.apocalypse.framework.security.SecurityProperties;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/** 仅在显式配置一次性密码时启用禁用的 bootstrap 管理员；不会重置任何已启用账号。 */
@Slf4j
@Component
@RequiredArgsConstructor
class BootstrapAdminInitializer implements ApplicationRunner {

  private final SecurityProperties securityProperties;

  private final UserService userService;

  @Override
  public void run(ApplicationArguments args) {
    SecurityProperties.Bootstrap bootstrap = securityProperties.getBootstrap();
    if (!StringUtils.hasText(bootstrap.getAdminPassword())) {
      return;
    }
    if (userService.initializeBootstrapAdmin(
        bootstrap.getAdminUsername(), bootstrap.getAdminPassword())) {
      log.warn("bootstrap 管理员已一次性启用；请立即移除 APOCALYPSE_BOOTSTRAP_ADMIN_PASSWORD");
    }
  }
}
