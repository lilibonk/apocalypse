package io.apocalypse.framework.log;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 操作日志注解：标注在需要审计的写操作方法上，由 {@link OperLogAspect} 采集并发布 {@link
 * io.apocalypse.common.event.OperLoggedEvent}（system 域异步落库 sys_oper_log）。
 */
@Documented
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface OperLog {

  /** 操作模块/标题（如 "用户管理"）。 */
  String title() default "";

  /** 业务动作类型（如 INSERT/UPDATE/DELETE）。 */
  String businessType() default "";

  /**
   * Optional JSON-pointer allowlist applied independently to arguments and result. Empty preserves
   * the legacy masked payload. A nonempty list records only selected scalar metadata; exception
   * text is also suppressed so rejected business content cannot leak through an error message.
   */
  String[] fields() default {};
}
