package io.apocalypse.framework.capability;

import org.springframework.boot.context.properties.ConfigurationProperties;

import lombok.Getter;
import lombok.Setter;

/** 编译期业务能力的配置事实源。能力默认关闭且只在应用启动时绑定。 */
@Getter
@Setter
@ConfigurationProperties("apocalypse.capabilities")
public class CapabilityProperties {

  private CalendarCapability calendar = new CalendarCapability();

  /** Calendar 模块开关。 */
  @Getter
  @Setter
  public static class CalendarCapability {

    private boolean enabled;
  }
}
