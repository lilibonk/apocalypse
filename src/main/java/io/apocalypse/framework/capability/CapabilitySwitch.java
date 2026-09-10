package io.apocalypse.framework.capability;

import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.core.env.Environment;

/** 条件解析与注册表共用同一种 Boolean 绑定语义，缺省关闭，非法配置失败。 */
public final class CapabilitySwitch {

  private CapabilitySwitch() {}

  public static boolean isEnabled(Environment environment, String key) {
    new CapabilityDefinition(key);
    return Binder.get(environment)
        .bind("apocalypse.capabilities." + key + ".enabled", Boolean.class)
        .orElse(false);
  }
}
