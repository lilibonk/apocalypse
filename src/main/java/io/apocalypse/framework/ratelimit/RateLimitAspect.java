package io.apocalypse.framework.ratelimit;

import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;

import jakarta.servlet.http.HttpServletRequest;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.UUID;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.redisson.api.RScript;
import org.redisson.api.RateType;
import org.redisson.api.RedissonClient;
import org.redisson.client.codec.StringCodec;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.core.io.ClassPathResource;
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

  private static final long MISSING = -2;

  private static final long ACQUIRED = 1;

  private static final long EXHAUSTED = 0;

  private static final String ACQUIRE_SCRIPT = loadAcquireScript();

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
    String name = "apoc:rl:" + key + ":" + currentCaller();
    long result = acquire(name, limit, interval);
    if (result == MISSING) {
      redissonClient
          .getRateLimiter(name)
          .trySetRate(RateType.OVERALL, limit, interval, interval.multipliedBy(2));
      result = acquire(name, limit, interval);
    }
    if (result == EXHAUSTED) {
      throw new BizException(ErrorCode.TOO_MANY_REQUESTS);
    }
    if (result != ACQUIRED) {
      throw new BizException(ErrorCode.SYSTEM_ERROR.getCode(), "限流配置尚未同步，请联系管理员");
    }
    return joinPoint.proceed();
  }

  private long acquire(String name, int limit, Duration interval) {
    // 配置可能在两条 Redis 命令之间过期并被其他实例重建，必须在扣减额度时原子核验。
    String tagged = "{" + name + "}";
    return redissonClient
        .getScript(StringCodec.INSTANCE)
        .eval(
            RScript.Mode.READ_WRITE,
            ACQUIRE_SCRIPT,
            RScript.ReturnType.LONG,
            List.of(name, tagged + ":value", tagged + ":permits"),
            limit,
            interval.toMillis(),
            UUID.randomUUID().toString());
  }

  private static String loadAcquireScript() {
    try {
      return new ClassPathResource("acquire-permit.lua", RateLimitAspect.class)
          .getContentAsString(StandardCharsets.UTF_8);
    } catch (IOException e) {
      throw new UncheckedIOException("无法读取限流 Redis 脚本", e);
    }
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
