package io.apocalypse.framework.ratelimit;

import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;

import jakarta.servlet.http.HttpServletRequest;

import java.time.Duration;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.redisson.api.RRateLimiter;
import org.redisson.api.RateLimiterConfig;
import org.redisson.api.RateType;
import org.redisson.api.RedissonClient;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import lombok.RequiredArgsConstructor;

/**
 * 限流切面：key = 注解 key（空则方法签名）+ 调用方 IP，Redisson 限流器名 {@code apoc:rl:{key}:{ip}}。 {@code trySetRate}
 * 仅在限流器不存在时写入速率；已有配置不一致时拒绝请求，避免静默使用旧阈值。超限抛 {@link BizException}(42900)。
 *
 * <p>实现注意：RRateLimiter 的许可计数存于独立键 {@code {name}:value} / {@code {name}:permits}（集群 hash-tag
 * 包装），清理限流器状态须三键并删（RateLimitIT 有对应处理与注释）。
 */
@Aspect
@Component
@RequiredArgsConstructor
@EnableConfigurationProperties(RateLimitProperties.class)
public class RateLimitAspect {

  private final RedissonClient redissonClient;

  private final RateLimitProperties properties;

  @Around("@annotation(rateLimit)")
  public Object around(ProceedingJoinPoint joinPoint, RateLimit rateLimit) throws Throwable {
    String key =
        StringUtils.hasText(rateLimit.key())
            ? rateLimit.key()
            : joinPoint.getSignature().toLongString();
    int limit = properties.getLimits().getOrDefault(key, rateLimit.limit());
    if (limit < 1 || rateLimit.windowSeconds() < 1) {
      throw new BizException(ErrorCode.SYSTEM_ERROR.getCode(), "限流配置无效，请联系管理员");
    }
    Duration interval = Duration.ofSeconds(rateLimit.windowSeconds());
    RRateLimiter limiter = redissonClient.getRateLimiter("apoc:rl:" + key + ":" + currentCaller());
    limiter.trySetRate(RateType.OVERALL, limit, interval);
    RateLimiterConfig config = limiter.getConfig();
    if (config.getRateType() != RateType.OVERALL
        || config.getRate() != limit
        || config.getRateInterval() != interval.toMillis()) {
      throw new BizException(ErrorCode.SYSTEM_ERROR.getCode(), "限流配置尚未同步，请联系管理员");
    }
    if (!limiter.tryAcquire()) {
      throw new BizException(ErrorCode.TOO_MANY_REQUESTS);
    }
    return joinPoint.proceed();
  }

  /** 调用方标识：web 请求取 IP，非 web 上下文退化为固定串（全局限流）。 */
  private static String currentCaller() {
    if (RequestContextHolder.getRequestAttributes()
        instanceof ServletRequestAttributes attributes) {
      HttpServletRequest request = attributes.getRequest();
      return request.getRemoteAddr();
    }
    return "unknown";
  }
}
