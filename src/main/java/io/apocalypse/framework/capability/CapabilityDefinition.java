package io.apocalypse.framework.capability;

/** 模块拥有的无副作用能力声明；配置不能自行注册未知模块。 */
public record CapabilityDefinition(String key) {

  public CapabilityDefinition {
    if (key == null || !key.matches("[a-z][a-z0-9-]*")) {
      throw new IllegalArgumentException("非法能力标识: " + key);
    }
  }
}
