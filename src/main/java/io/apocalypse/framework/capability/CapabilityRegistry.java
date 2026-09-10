package io.apocalypse.framework.capability;

import io.apocalypse.common.exception.BizException;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Collectors;

import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/** 服务端能力注册表。空 module key 表示核心能力；未知非空 key 一律关闭，避免配置或数据拼写错误时意外暴露功能。 */
@Component
public class CapabilityRegistry {

  private final Map<String, Boolean> states;

  public CapabilityRegistry(List<CapabilityDefinition> definitions, Environment environment) {
    Map<String, Boolean> registered = new TreeMap<>();
    for (CapabilityDefinition definition : definitions) {
      String key = definition.key();
      if (registered.putIfAbsent(key, CapabilitySwitch.isEnabled(environment, key)) != null) {
        throw new IllegalStateException("重复能力声明: " + key);
      }
    }
    states = Collections.unmodifiableMap(registered);
  }

  /** 返回能力是否启用；核心能力始终启用，未知模块 fail-closed。 */
  public boolean isEnabled(String moduleKey) {
    if (!StringUtils.hasText(moduleKey)) {
      return true;
    }
    return states.getOrDefault(moduleKey, false);
  }

  /** 能力状态参与持久缓存 key，避免不同配置的实例或重启周期复用错误的权限快照。 */
  public String cacheDiscriminator() {
    return "caps:v1"
        + states.entrySet().stream()
            .map(entry -> ";" + entry.getKey() + "=" + (entry.getValue() ? "1" : "0"))
            .collect(Collectors.joining());
  }

  /** 统一 guard；错误码和文案由调用模块提供，framework 不反向依赖业务模块。 */
  public void requireEnabled(String moduleKey, int errorCode, String message) {
    if (!isEnabled(moduleKey)) {
      throw new BizException(errorCode, message);
    }
  }
}
