package io.apocalypse.framework.security;

import java.io.Serializable;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;

import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import lombok.RequiredArgsConstructor;

/**
 * 在线用户注册表 + JWT 黑名单（登录安全四件套：强退能力）。
 *
 * <p>登录成功写 {@code apoc:online:{jti}} = OnlineUser JSON（TTL = 令牌有效期，含关联的 refresh jti）；强退删在线条目并把
 * access jti 与关联 refresh jti 一并写入 {@code apoc:jwt:blacklist:{jti}}（TTL = 各自剩余有效期，过期令牌无需占位），由 {@link
 * JwtBlacklistFilter} 逐请求校验。
 */
@Component
@RequiredArgsConstructor
public class OnlineUserRegistry {

  /** 在线条目 Redis key 前缀。 */
  public static final String ONLINE_KEY_PREFIX = "apoc:online:";

  /** JWT 黑名单 Redis key 前缀。 */
  public static final String BLACKLIST_KEY_PREFIX = "apoc:jwt:blacklist:";

  private final RedisTemplate<String, Object> redisTemplate;

  private final SecurityProperties securityProperties;

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
            new OnlineUser(username, LocalDateTime.now(), ip, userAgent, refreshJti),
            Duration.ofMinutes(securityProperties.getJwt().getTtlMinutes()));
  }

  /** 全量在线会话。用 KEYS 模式匹配——管理台在线会话量级有限，可接受；生产环境（大 keyspace / 高并发）改 SCAN。 */
  public List<OnlineSession> listAll() {
    Set<String> keys = redisTemplate.keys(ONLINE_KEY_PREFIX + "*");
    if (keys == null || keys.isEmpty()) {
      return List.of();
    }
    return keys.stream()
        .sorted()
        .map(
            key -> {
              Object value = redisTemplate.opsForValue().get(key);
              return value instanceof OnlineUser user
                  ? new OnlineSession(key.substring(ONLINE_KEY_PREFIX.length()), user)
                  : null;
            })
        .filter(session -> session != null)
        .toList();
  }

  /**
   * 强退：删在线条目 + access jti 写入黑名单（TTL = 令牌剩余有效期；已过期则不占位）； 关联的 refresh jti 一并拉黑（TTL = refresh
   * 剩余有效期），杜绝强退后换发新令牌。
   */
  public void kick(String jti) {
    Object value = redisTemplate.opsForValue().get(ONLINE_KEY_PREFIX + jti);
    redisTemplate.delete(ONLINE_KEY_PREFIX + jti);
    if (value instanceof OnlineUser user) {
      long remainingMillis = remainingValidityMillis(user);
      if (remainingMillis > 0) {
        redisTemplate
            .opsForValue()
            .set(BLACKLIST_KEY_PREFIX + jti, 1, Duration.ofMillis(remainingMillis));
      }
      if (StringUtils.hasText(user.refreshJti())) {
        blacklist(user.refreshJti(), Duration.ofMillis(remainingRefreshValidityMillis(user)));
      }
    }
  }

  /** jti 是否在黑名单中。 */
  public boolean isBlacklisted(String jti) {
    return Boolean.TRUE.equals(redisTemplate.hasKey(BLACKLIST_KEY_PREFIX + jti));
  }

  /** 注销在线条目（refresh 旋转时旧 access jti 下线的场景，不拉黑）。 */
  public void unregister(String jti) {
    redisTemplate.delete(ONLINE_KEY_PREFIX + jti);
  }

  /** 将 jti 写入黑名单，TTL 由调用方指定（refresh 旋转：取旧 refresh token 剩余有效期；已过期则不占位）。 */
  public void blacklist(String jti, Duration ttl) {
    if (ttl != null && !ttl.isNegative() && !ttl.isZero()) {
      redisTemplate.opsForValue().set(BLACKLIST_KEY_PREFIX + jti, 1, ttl);
    }
  }

  /** 令牌剩余有效期（毫秒）：登录时间 + TTL - 当前时间。 */
  private long remainingValidityMillis(OnlineUser user) {
    LocalDateTime expireAt =
        user.loginTime().plusMinutes(securityProperties.getJwt().getTtlMinutes());
    return Duration.between(LocalDateTime.now(), expireAt).toMillis();
  }

  /** refresh 令牌剩余有效期（毫秒）：登录时间 + refresh TTL（天） - 当前时间；已过期返回负值（调用方不占位）。 */
  private long remainingRefreshValidityMillis(OnlineUser user) {
    LocalDateTime expireAt =
        user.loginTime().plusDays(securityProperties.getJwt().getRefreshTtlDays());
    return Duration.between(LocalDateTime.now(), expireAt).toMillis();
  }
}
