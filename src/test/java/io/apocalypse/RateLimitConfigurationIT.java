package io.apocalypse;

import io.apocalypse.common.exception.BizException;
import io.apocalypse.framework.ratelimit.RateLimit;
import io.apocalypse.framework.ratelimit.RateLimitAspect;
import io.apocalypse.framework.ratelimit.RateLimitProperties;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;

import org.aspectj.lang.ProceedingJoinPoint;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.redisson.Redisson;
import org.redisson.api.RRateLimiter;
import org.redisson.api.RScript;
import org.redisson.api.RateType;
import org.redisson.api.RedissonClient;
import org.redisson.client.RedisException;
import org.redisson.client.codec.StringCodec;
import org.redisson.config.Config;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** 保留真实 Redis 状态验证配置漂移、跨客户端额度与受控空闲迁移。 */
class RateLimitConfigurationIT extends AbstractIntegrationTest {

  private static final String RULE = "rate-policy-it";
  private static final String KEY = "apoc:rl:" + RULE + ":198.51.100.41";
  private static final Duration WINDOW = Duration.ofSeconds(60);

  @Autowired private RedissonClient redissonClient;

  @BeforeEach
  void prepareCaller() {
    limiter().delete();
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.setRemoteAddr("198.51.100.41");
    RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
  }

  @AfterEach
  void cleanup() {
    RequestContextHolder.resetRequestAttributes();
    limiter().delete();
    redissonClient.getBucket(KEY + ":unrelated").delete();
  }

  @Test
  void loweringConfiguredRateRejectsOldStateWithoutConsumingOrResetting() throws Exception {
    limiter().trySetRate(RateType.OVERALL, 20, WINDOW);
    assertThat(limiter().tryAcquire()).isTrue();

    assertDriftRejected(aspect(redissonClient, 2));

    assertThat(limiter().getConfig().getRate()).isEqualTo(20);
    assertThat(limiter().availablePermits()).isEqualTo(19);
  }

  @Test
  void increasingConfiguredRateAlsoRequiresControlledMigration() throws Exception {
    limiter().trySetRate(RateType.OVERALL, 2, WINDOW);
    assertThat(limiter().tryAcquire()).isTrue();

    assertDriftRejected(aspect(redissonClient, 20));

    assertThat(limiter().getConfig().getRate()).isEqualTo(2);
    assertThat(limiter().availablePermits()).isEqualTo(1);
  }

  @Test
  void windowAndModeMismatchAreRejected() throws Exception {
    limiter().trySetRate(RateType.OVERALL, 2, Duration.ofSeconds(120));
    assertDriftRejected(aspect(redissonClient, 2));
    limiter().delete();
    limiter().trySetRate(RateType.PER_CLIENT, 2, WINDOW);
    assertDriftRejected(aspect(redissonClient, 2));
  }

  @Test
  void invalidConfiguredLimitDoesNotCreateLimiter() throws Exception {
    ProceedingJoinPoint business = mock(ProceedingJoinPoint.class);
    assertThatThrownBy(() -> aspect(redissonClient, 0).around(business, annotation()))
        .isInstanceOf(BizException.class)
        .hasMessage("限流配置无效，请联系管理员");
    assertThat(limiter().isExists()).isFalse();
    verifyNoInteractions(business);
  }

  @Test
  void restartedAndSecondClientsShareConsumedPermits() throws Throwable {
    RedissonClient first = newClient();
    try {
      assertThat(invoke(aspect(first, 2))).isEqualTo("accepted");
    } finally {
      first.shutdown();
    }
    RedissonClient restarted = newClient();
    try {
      assertThat(invoke(aspect(restarted, 2))).isEqualTo("accepted");
      assertThatThrownBy(() -> invoke(aspect(redissonClient, 2)))
          .isInstanceOfSatisfying(
              BizException.class, e -> assertThat(e.getCode()).isEqualTo(42900));
    } finally {
      restarted.shutdown();
    }
  }

  @Test
  void mismatchRemainsRejectedAfterClientRestart() throws Exception {
    RedissonClient first = newClient();
    try {
      first.getRateLimiter(KEY).trySetRate(RateType.OVERALL, 20, WINDOW);
    } finally {
      first.shutdown();
    }
    RedissonClient restarted = newClient();
    try {
      assertDriftRejected(aspect(restarted, 2));
    } finally {
      restarted.shutdown();
    }
  }

  @Test
  void concurrentInstancesShareOneQuota() throws Exception {
    RedissonClient second = newClient();
    try (var executor = Executors.newFixedThreadPool(4)) {
      List<Callable<Boolean>> attempts = new ArrayList<>();
      for (int i = 0; i < 20; i++) {
        RateLimitAspect instance = aspect(i % 2 == 0 ? redissonClient : second, 5);
        attempts.add(
            () -> {
              MockHttpServletRequest request = new MockHttpServletRequest();
              request.setRemoteAddr("198.51.100.41");
              RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
              try {
                invoke(instance);
                return true;
              } catch (BizException e) {
                assertThat(e.getCode()).isEqualTo(42900);
                return false;
              } catch (Throwable e) {
                throw new AssertionError(e);
              } finally {
                RequestContextHolder.resetRequestAttributes();
              }
            });
      }
      int accepted = 0;
      for (var result : executor.invokeAll(attempts)) {
        if (result.get()) {
          accepted++;
        }
      }
      assertThat(accepted).isEqualTo(5);
    } finally {
      second.shutdown();
    }
  }

  @Test
  void migrationRejectsRecentPermitsAndKeepsState() throws Throwable {
    invokeShort(aspect(redissonClient, 2));
    assertThatThrownBy(() -> resetIdle(2000, stateKeys()))
        .isInstanceOf(RedisException.class)
        .hasMessageContaining("Limiter has recent permits");
    assertThat(limiter().getConfig().getRate()).isEqualTo(2);
    assertThat(limiter().availablePermits()).isEqualTo(1);
  }

  @Test
  void idleMigrationAppliesNewRateAndSupportsCoordinatedRollback() throws Throwable {
    limiter().trySetRate(RateType.OVERALL, 20, Duration.ofMillis(100));
    limiter().tryAcquire();
    redissonClient.getBucket(KEY + ":unrelated", StringCodec.INSTANCE).set("preserve");
    // 新窗口比旧窗口长：只等待旧窗口不足以迁移。
    Thread.sleep(150);
    assertThatThrownBy(() -> resetIdle(2000, stateKeys()))
        .isInstanceOf(RedisException.class)
        .hasMessageContaining("Limiter has recent permits");
    Thread.sleep(2000);

    assertThat(resetIdle(2000, stateKeys())).isEqualTo(3);
    assertThat(redissonClient.getBucket(KEY + ":unrelated", StringCodec.INSTANCE).get())
        .isEqualTo("preserve");
    assertThat(invokeShort(aspect(redissonClient, 2))).isEqualTo("accepted");
    assertThat(invokeShort(aspect(redissonClient, 2))).isEqualTo("accepted");
    assertThatThrownBy(() -> invokeShort(aspect(redissonClient, 2)))
        .isInstanceOfSatisfying(BizException.class, e -> assertThat(e.getCode()).isEqualTo(42900));
    assertDriftRejected(aspect(redissonClient, 20));

    Thread.sleep(2100);
    assertThat(resetIdle(2000, stateKeys())).isEqualTo(3);
    assertThat(invokeShort(aspect(redissonClient, 20))).isEqualTo("accepted");
    assertThat(limiter().getConfig().getRate()).isEqualTo(20);
  }

  @Test
  void migrationRejectsForeignKeysAndOrphanState() throws Exception {
    limiter().trySetRate(RateType.OVERALL, 2, WINDOW);
    redissonClient.getBucket(KEY + ":unrelated", StringCodec.INSTANCE).set("preserve");
    assertThatThrownBy(
            () -> resetIdle(2000, List.of(KEY, "{" + KEY + "}:value", KEY + ":unrelated")))
        .isInstanceOf(RedisException.class)
        .hasMessageContaining("Limiter key ownership mismatch");
    assertThat(limiter().isExists()).isTrue();
    assertThat(redissonClient.getBucket(KEY + ":unrelated", StringCodec.INSTANCE).get())
        .isEqualTo("preserve");
    limiter().delete();
    redissonClient.getBucket("{" + KEY + "}:value", StringCodec.INSTANCE).set("1");
    assertThatThrownBy(() -> resetIdle(2000, stateKeys()))
        .isInstanceOf(RedisException.class)
        .hasMessageContaining("Orphan limiter state");
  }

  private RRateLimiter limiter() {
    return redissonClient.getRateLimiter(KEY);
  }

  private static List<Object> stateKeys() {
    return List.of(KEY, "{" + KEY + "}:value", "{" + KEY + "}:permits");
  }

  private long resetIdle(long newWindowMillis, List<Object> keys) throws Exception {
    String script = Files.readString(Path.of("scripts/redis/reset-idle-rate-limiter.lua"));
    return redissonClient
        .getScript(StringCodec.INSTANCE)
        .eval(RScript.Mode.READ_WRITE, script, RScript.ReturnType.LONG, keys, newWindowMillis);
  }

  private static RedissonClient newClient() {
    Config config = new Config();
    config
        .useSingleServer()
        .setAddress("redis://" + REDIS.getHost() + ":" + REDIS.getMappedPort(6379))
        .setConnectionMinimumIdleSize(1)
        .setConnectionPoolSize(4);
    return Redisson.create(config);
  }

  private static RateLimitAspect aspect(RedissonClient client, int limit) {
    RateLimitProperties properties = new RateLimitProperties();
    properties.setLimits(Map.of(RULE, limit));
    return new RateLimitAspect(client, properties);
  }

  private static RateLimit annotation() throws Exception {
    return RateLimitConfigurationIT.class
        .getDeclaredMethod("endpoint")
        .getAnnotation(RateLimit.class);
  }

  @RateLimit(key = RULE, limit = 2, windowSeconds = 60)
  private static void endpoint() {}

  @RateLimit(key = RULE, limit = 2, windowSeconds = 2)
  private static void shortEndpoint() {}

  private static Object invokeShort(RateLimitAspect aspect) throws Throwable {
    ProceedingJoinPoint business = mock(ProceedingJoinPoint.class);
    when(business.proceed()).thenReturn("accepted");
    return aspect.around(
        business,
        RateLimitConfigurationIT.class
            .getDeclaredMethod("shortEndpoint")
            .getAnnotation(RateLimit.class));
  }

  private static Object invoke(RateLimitAspect aspect) throws Throwable {
    ProceedingJoinPoint business = mock(ProceedingJoinPoint.class);
    when(business.proceed()).thenReturn("accepted");
    return aspect.around(business, annotation());
  }

  private static void assertDriftRejected(RateLimitAspect aspect) throws Exception {
    ProceedingJoinPoint business = mock(ProceedingJoinPoint.class);
    assertThatThrownBy(() -> aspect.around(business, annotation()))
        .isInstanceOfSatisfying(BizException.class, e -> assertThat(e.getCode()).isEqualTo(50000))
        .hasMessage("限流配置尚未同步，请联系管理员");
    verifyNoInteractions(business);
  }
}
