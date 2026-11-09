package io.apocalypse.framework.security;

import io.apocalypse.framework.redis.RedisKeyScanner;

import java.io.Serializable;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import lombok.RequiredArgsConstructor;

/**
 * 在线用户注册表 + JWT 黑名单（登录安全四件套：强退能力）。
 *
 * <p>登录成功写 {@code apoc:online:v2:{jti}} = OnlineUser JSON（TTL = 令牌有效期，含关联的 refresh jti）；强退删在线条目并把
 * access jti 与关联 refresh jti 一并写入 {@code apoc:jwt:blacklist:{jti}}（TTL = 各自剩余有效期，过期令牌无需占位），由 {@link
 * JwtBlacklistFilter} 逐请求校验。
 */
@Component
@RequiredArgsConstructor
public class OnlineUserRegistry {

  /** 在线条目 Redis key 前缀。 */
  public static final String ONLINE_KEY_PREFIX = "apoc:online:v2:";

  /** JWT 黑名单 Redis key 前缀。 */
  public static final String BLACKLIST_KEY_PREFIX = "apoc:jwt:blacklist:";

  private final RedisTemplate<String, Object> redisTemplate;

  private final StringRedisTemplate stringRedisTemplate;

  private final SecurityProperties securityProperties;

  private final ObjectProvider<Clock> clockProvider;

  /** 在线用户视图（Redis JSON 存储）。refreshJti 记录本次会话关联的 refresh token jti，供强退联动拉黑。 */
  public record OnlineUser(
      String username, LocalDateTime loginTime, String ip, String userAgent, String refreshJti)
      implements Serializable {}

  /** 在线会话视图（jti + 用户信息），供在线用户列表使用。 */
  public record OnlineSession(String jti, OnlineUser user) implements Serializable {}

  /** 登录成功后注册在线条目（access jti 为键，关联 refresh jti 一并持久化）。 */
  public void register(
      String jti, String refreshJti, String username, String ip, String userAgent) {
    redisTemplate
        .opsForValue()
        .set(
            ONLINE_KEY_PREFIX + jti,
            new OnlineUser(username, now(), ip, userAgent, refreshJti),
            Duration.ofMinutes(securityProperties.getJwt().getTtlMinutes()));
  }

  /** 全量在线会话。使用 SCAN 分批遍历键名，再通过 MGET（{@code multiGet}）单次往返批量读取值，避免 N+1 阻塞。 */
  public List<OnlineSession> listAll() {
    Set<String> keys = RedisKeyScanner.scan(redisTemplate, ONLINE_KEY_PREFIX + "*");
    if (keys.isEmpty()) {
      return List.of();
    }
    List<String> sortedKeys = keys.stream().sorted().toList();
    List<Object> values = redisTemplate.opsForValue().multiGet(sortedKeys);
    if (values == null || values.isEmpty()) {
      return List.of();
    }
    List<OnlineSession> sessions = new ArrayList<>(sortedKeys.size());
    for (int i = 0; i < sortedKeys.size() && i < values.size(); i++) {
      if (values.get(i) instanceof OnlineUser user) {
        sessions.add(
            new OnlineSession(sortedKeys.get(i).substring(ONLINE_KEY_PREFIX.length()), user));
      }
    }
    return List.copyOf(sessions);
  }

  /** 指定用户的在线会话列表（按登录时间倒序）。 */
  public List<OnlineSession> listByUsername(String username) {
    if (!StringUtils.hasText(username)) {
      return List.of();
    }
    return listAll().stream()
        .filter(session -> username.equals(session.user().username()))
        .sorted(
            (a, b) -> {
              LocalDateTime left = a.user().loginTime();
              LocalDateTime right = b.user().loginTime();
              if (left == null && right == null) {
                return a.jti().compareTo(b.jti());
              }
              if (left == null) {
                return 1;
              }
              if (right == null) {
                return -1;
              }
              int cmp = right.compareTo(left);
              return cmp != 0 ? cmp : a.jti().compareTo(b.jti());
            })
        .toList();
  }

  /** 读取所选在线条目；条目已过期或刷新移除时，调用方必须要求重新选择。 */
  public Optional<OnlineUser> find(String jti) {
    Object value = redisTemplate.opsForValue().get(ONLINE_KEY_PREFIX + jti);
    return value instanceof OnlineUser user ? Optional.of(user) : Optional.empty();
  }

  /**
   * 强退单会话：删在线条目 + access jti 写入黑名单（TTL = 令牌剩余有效期；已过期则不占位）； 关联的 refresh jti 一并拉黑（TTL = refresh
   * 剩余有效期），杜绝强退后换发新令牌。
   */
  public void kick(String jti) {
    Object value = redisTemplate.opsForValue().get(ONLINE_KEY_PREFIX + jti);
    redisTemplate.delete(ONLINE_KEY_PREFIX + jti);
    if (value instanceof OnlineUser user) {
      long remainingMillis = remainingValidityMillis(user);
      if (remainingMillis > 0) {
        stringRedisTemplate
            .opsForValue()
            .set(BLACKLIST_KEY_PREFIX + jti, "1", Duration.ofMillis(remainingMillis));
      }
      if (StringUtils.hasText(user.refreshJti())) {
        blacklist(user.refreshJti(), Duration.ofMillis(remainingRefreshValidityMillis(user)));
      }
    }
  }

  /** 注销指定用户的全部在线条目；持久化凭证代次仍是最终撤销真源。 */
  public void kickAll(String username) {
    listAll().stream()
        .filter(session -> username.equals(session.user().username()))
        .map(OnlineSession::jti)
        .forEach(this::kick);
  }

  /** jti 是否在黑名单中。 */
  public boolean isBlacklisted(String jti) {
    return Boolean.TRUE.equals(stringRedisTemplate.hasKey(BLACKLIST_KEY_PREFIX + jti));
  }

  /** 原子消费一次性令牌 jti。仅首个调用方能以 SET NX 写入黑名单；并发重放会得到 false。 */
  public boolean tryBlacklist(String jti, Duration ttl) {
    if (!StringUtils.hasText(jti) || ttl == null || ttl.isNegative() || ttl.isZero()) {
      return false;
    }
    return Boolean.TRUE.equals(
        stringRedisTemplate.opsForValue().setIfAbsent(BLACKLIST_KEY_PREFIX + jti, "1", ttl));
  }

  /** 注销在线条目（refresh 旋转时旧 access jti 下线的场景，不拉黑）。 */
  public void unregister(String jti) {
    redisTemplate.delete(ONLINE_KEY_PREFIX + jti);
  }

  /** 将 jti 写入黑名单，TTL 由调用方指定（refresh 旋转：取旧 refresh token 剩余有效期；已过期则不占位）。 */
  public void blacklist(String jti, Duration ttl) {
    if (ttl != null && !ttl.isNegative() && !ttl.isZero()) {
      stringRedisTemplate.opsForValue().set(BLACKLIST_KEY_PREFIX + jti, "1", ttl);
    }
  }

  private LocalDateTime now() {
    Clock clock = clockProvider.getIfAvailable(Clock::systemUTC);
    return LocalDateTime.ofInstant(clock.instant(), ZoneId.systemDefault());
  }

  /** 令牌剩余有效期（毫秒）：登录时间 + TTL - 当前时间。 */
  private long remainingValidityMillis(OnlineUser user) {
    LocalDateTime expireAt =
        user.loginTime().plusMinutes(securityProperties.getJwt().getTtlMinutes());
    return Duration.between(now(), expireAt).toMillis();
  }

  /** refresh 令牌剩余有效期（毫秒）：登录时间 + refresh TTL（天） - 当前时间；已过期返回负值（调用方不占位）。 */
  private long remainingRefreshValidityMillis(OnlineUser user) {
    LocalDateTime expireAt =
        user.loginTime().plusDays(securityProperties.getJwt().getRefreshTtlDays());
    return Duration.between(now(), expireAt).toMillis();
  }
}
