package io.apocalypse.framework.ratelimit;

import java.util.HashMap;
import java.util.Map;

import org.springframework.boot.context.properties.ConfigurationProperties;

import lombok.Getter;
import lombok.Setter;

/**
 * 限流配置（{@code apocalypse.ratelimit}）。按 {@link RateLimit#key()} 覆盖注解默认 limit—— 例：{@code
 * apocalypse.ratelimit.limits.login=1000} 将 key=login 的限流放大为窗口内 1000 次（集成测试用）。
 */
@Getter
@Setter
@ConfigurationProperties("apocalypse.ratelimit")
public class RateLimitProperties {

  /** key → 窗口内允许次数 的覆盖表。 */
  private Map<String, Integer> limits = new HashMap<>();
}
