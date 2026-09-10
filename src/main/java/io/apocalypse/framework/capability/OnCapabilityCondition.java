package io.apocalypse.framework.capability;

import java.util.Map;

import org.springframework.context.annotation.ConditionContext;
import org.springframework.context.annotation.ConfigurationCondition;
import org.springframework.core.type.AnnotatedTypeMetadata;

/** 条件不依赖 bean，避免配置解析阶段提前创建注册表或业务组件。 */
final class OnCapabilityCondition implements ConfigurationCondition {

  @Override
  public ConfigurationPhase getConfigurationPhase() {
    return ConfigurationPhase.PARSE_CONFIGURATION;
  }

  @Override
  public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
    Map<String, Object> attributes =
        metadata.getAnnotationAttributes(ConditionalOnCapability.class.getName());
    if (attributes == null) {
      throw new IllegalStateException("缺少能力条件声明");
    }
    return CapabilitySwitch.isEnabled(context.getEnvironment(), (String) attributes.get("value"));
  }
}
