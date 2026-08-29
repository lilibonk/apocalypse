package io.apocalypse.common.annotation;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 【2 期 Agent 接入预留】标记一个 facade 方法/类型允许作为"工具"暴露给外部 Agent。
 *
 * <p>1 期仅占位与约定：默认不暴露任何能力；2 期的 agent-integration 模块将扫描本注解， 从标注的 facade 生成 MCP
 * 工具定义。标注即授权，未标注即不暴露（白名单原则）。
 */
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface AgentExposed {

  /** 工具描述，写给大模型看的（影响工具选择准确率）。 */
  String value() default "";

  /** 是否只读操作。写操作在 2 期默认要求更高 scope 与人工确认钩子。 */
  boolean readOnly() default true;
}
