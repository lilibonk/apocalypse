package io.apocalypse.framework.ratelimit;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 限流注解：标注在需要限流的端点方法上，由 {@link RateLimitAspect} 用 Redisson {@code RRateLimiter} 执行。 注解上的 limit
 * 为默认值，实际生效值可被配置 {@code apocalypse.ratelimit.limits.<key>} 覆盖（测试环境放大用）。
 */
@Documented
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface RateLimit {

  /** 窗口内允许的次数（默认值，可被配置覆盖）。 */
  int limit() default 10;

  /** 窗口长度（秒）。 */
  long windowSeconds() default 60;

  /** 限流标识（Redis key 片段）；空则取方法签名。配置覆盖也按本 key 匹配。 */
  String key() default "";
}
