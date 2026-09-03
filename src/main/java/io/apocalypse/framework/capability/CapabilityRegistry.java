package io.apocalypse.framework.capability;

import io.apocalypse.common.exception.BizException;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import lombok.RequiredArgsConstructor;

/** 服务端能力注册表。空 module key 表示核心能力；未知非空 key 一律关闭，避免配置或数据拼写错误时意外暴露功能。 */
@Component
@EnableConfigurationProperties(CapabilityProperties.class)
@RequiredArgsConstructor
public class CapabilityRegistry {

  public static final String CALENDAR = "calendar";

  private final CapabilityProperties properties;

  /** 返回能力是否启用；核心能力始终启用，未知模块 fail-closed。 */
  public boolean isEnabled(String moduleKey) {
    if (!StringUtils.hasText(moduleKey)) {
      return true;
    }
    return CALENDAR.equals(moduleKey) && properties.getCalendar().isEnabled();
  }

  /** 能力状态参与持久缓存 key，避免不同配置的实例或重启周期复用错误的权限快照。 */
  public String cacheDiscriminator() {
    return CALENDAR + "=" + isEnabled(CALENDAR);
  }

  /** 统一 guard；错误码和文案由调用模块提供，framework 不反向依赖业务模块。 */
  public void requireEnabled(String moduleKey, int errorCode, String message) {
    if (!isEnabled(moduleKey)) {
      throw new BizException(errorCode, message);
    }
  }
}
