package io.apocalypse.framework.capability;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.springframework.context.annotation.Conditional;

/** 仅用于模块运行配置；在解析扫描与 Import 前判断。 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Conditional(OnCapabilityCondition.class)
public @interface ConditionalOnCapability {
  String value();
}
