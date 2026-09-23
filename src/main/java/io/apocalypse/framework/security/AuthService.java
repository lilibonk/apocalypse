package io.apocalypse.framework.security;

import io.apocalypse.common.event.AuditTextSanitizer;
import io.apocalypse.common.event.LoginFailedEvent;
import io.apocalypse.common.event.LoginSucceededEvent;
import io.apocalypse.common.exception.BizException;
import io.apocalypse.common.response.ErrorCode;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * 认证服务：账密登录（走 {@link LoginUserQuery} 防腐端口）与 client_credentials 服务账号令牌。
 *
 * <p>账密登录内置登录安全四件套之二的失败锁定与审计：失败时 {@code INCR apoc:login:fail:{username}}（首次设 10 分钟 TTL），累计 ≥5 次直接抛
 * 42901 锁定；成功登录后清除计数。成功/失败分别发布 {@link LoginSucceededEvent} / {@link LoginFailedEvent}（system 域异步落
 * sys_login_log）；签发的用户令牌带 {@code jti} 并注册在线条目。
 *
 * <p>登录签发双令牌：access token（TTL 走 {@code jwt.ttl-minutes}）+ refresh token（claim {@code
 * type=refresh}，TTL 走 {@code jwt.refresh-ttl-days}，默认 7 天）。refresh 采用旋转机制：旧 refresh jti
 * 进黑名单（TTL=剩余有效期）， 旧 access 在线条目注销，重新签发新令牌对；旧 refresh 重复使用会命中黑名单被拒绝。refresh token 的 {@code atj}
 * claim 记录关联的 access jti，供旋转时定位在线条目；在线条目反向持久化 refresh jti，供强退联动拉黑。
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AuthService {

  /** 失败计数 Redis key 前缀。 */
  private static final String LOGIN_FAIL_PREFIX = "apoc:login:fail:";

  /** refresh token 的 type claim 值。 */
  private static final String TOKEN_TYPE_REFRESH = "refresh";

  /** access token 的 type claim 值。 */
  private static final String TOKEN_TYPE_ACCESS = "access";

  /** client token 的 type claim 值。 */
  private static final String TOKEN_TYPE_CLIENT = "client";

  /** 锁定阈值：连续失败次数。 */
  private static final int MAX_FAIL_COUNT = 5;

  /** 失败计数窗口（首次失败起算）。 */
  private static final Duration FAIL_WINDOW = Duration.ofMinutes(10);

  private final ObjectProvider<LoginUserQuery> loginUserQuery;

  private final PasswordEncoder passwordEncoder;

  private final JwtEncoder jwtEncoder;

  private final JwtDecoder jwtDecoder;

  private final SecurityProperties securityProperties;

  private final StringRedisTemplate stringRedisTemplate;

  private final LoginEventPublisher loginEventPublisher;

  private final OnlineUserRegistry onlineUserRegistry;

  private final TokenVersionStore tokenVersionStore;

  /** 登录响应（refreshToken 仅账密登录签发，client 令牌为 null）。 */
  public record TokenResponse(
      String accessToken,
      @Schema(nullable = true) String refreshToken,
      String tokenType,
      long expiresIn) {}

  /** 账密登录。system 模块未提供 {@link LoginUserQuery} 实现时返回空——由 Controller 层转为 "登录能力未接入"响应，不阻塞应用启动。 */
  public Optional<TokenResponse> login(
      String username, String rawPassword, String ip, String userAgent) {
    LoginUserQuery query = loginUserQuery.getIfAvailable();
    if (query == null) {
      return Optional.empty();
    }
    String failKey = LOGIN_FAIL_PREFIX + username;
    if (failCount(failKey) >= MAX_FAIL_COUNT) {
      throw new BizException(ErrorCode.ACCOUNT_LOCKED);
    }
    try {
      LoginUser user =
          query
              .findLoginUserByUsername(username)
              .filter(LoginUser::enabled)
              .filter(u -> passwordEncoder.matches(rawPassword, u.password()))
              .orElseThrow(() -> new BizException(ErrorCode.UNAUTHORIZED.getCode(), "用户名或密码错误"));
      stringRedisTemplate.delete(failKey);
      String auditUsername =
          AuditTextSanitizer.fit(username, AuditTextSanitizer.USERNAME_MAX_LENGTH);
      String auditIp = AuditTextSanitizer.fit(ip, AuditTextSanitizer.IP_MAX_LENGTH);
      String auditUserAgent =
          AuditTextSanitizer.fit(userAgent, AuditTextSanitizer.USER_AGENT_MAX_LENGTH);
      loginEventPublisher.publish(
          new LoginSucceededEvent(
              UUID.randomUUID(), LocalDateTime.now(), auditUsername, auditIp, auditUserAgent));
      return Optional.of(issueToken(user, auditIp, auditUserAgent));
    } catch (BizException e) {
      recordFailure(failKey);
      loginEventPublisher.publish(
          new LoginFailedEvent(
              UUID.randomUUID(),
              LocalDateTime.now(),
              AuditTextSanitizer.fit(username, AuditTextSanitizer.USERNAME_MAX_LENGTH),
              AuditTextSanitizer.fit(ip, AuditTextSanitizer.IP_MAX_LENGTH),
              AuditTextSanitizer.fit(userAgent, AuditTextSanitizer.USER_AGENT_MAX_LENGTH),
              AuditTextSanitizer.fit(e.getMessage(), AuditTextSanitizer.MESSAGE_MAX_LENGTH)));
      throw e;
    }
  }

  /**
   * client_credentials 风格：对照配置的服务账号签发令牌。 服务账号（外部 Agent）不签发 refresh token——凭证过期后重新走
   * client_credentials 认证即可，无需刷新链路。
   */
  public TokenResponse issueClientToken(String clientId, String clientSecret) {
    SecurityProperties.Client client =
        securityProperties.getClients().stream()
            .filter(c -> c.getClientId().equals(clientId))
            .filter(c -> secretsEqual(c.getClientSecret(), clientSecret))
            .findFirst()
            .orElseThrow(() -> new BizException(ErrorCode.UNAUTHORIZED.getCode(), "客户端凭证无效"));
    Instant now = Instant.now();
    long ttlSeconds = securityProperties.getJwt().getTtlMinutes() * 60;
    JwtClaimsSet claims =
        JwtClaimsSet.builder()
            .issuer(securityProperties.getJwt().getIssuer())
            .audience(List.of(securityProperties.getJwt().getAudience()))
            .subject(client.getClientId())
            .id(UUID.randomUUID().toString())
            .issuedAt(now)
            .expiresAt(now.plusSeconds(ttlSeconds))
            .claim("type", TOKEN_TYPE_CLIENT)
            .claim("scope", String.join(" ", client.getScopes()))
            .build();
    String token = encode(claims);
    return new TokenResponse(token, null, "Bearer", ttlSeconds);
  }

  /**
   * refresh 旋转：校验签名/过期/{@code type=refresh}，旧 refresh jti 进黑名单（TTL=剩余有效期）， 旧 access 在线条目注销，重签新令牌对。旧
   * refresh 重复使用命中黑名单，抛 40100。
   */
  public TokenResponse refresh(String refreshToken, String ip, String userAgent) {
    Jwt jwt;
    try {
      jwt = jwtDecoder.decode(refreshToken);
    } catch (JwtException e) {
      throw new BizException(ErrorCode.UNAUTHORIZED.getCode(), "凭证已失效");
    }
    String jti = jwt.getId();
    if (!TOKEN_TYPE_REFRESH.equals(jwt.getClaimAsString("type"))
        || !StringUtils.hasText(jti)
        || onlineUserRegistry.isBlacklisted(jti)) {
      throw new BizException(ErrorCode.UNAUTHORIZED.getCode(), "凭证已失效");
    }
    LoginUserQuery query = loginUserQuery.getIfAvailable();
    if (query == null) {
      throw new BizException(ErrorCode.SYSTEM_ERROR.getCode(), "登录能力未接入");
    }
    // 用户可能被禁用/删除，旋转前重新校验
    LoginUser user =
        query
            .findLoginUserByUsername(jwt.getSubject())
            .filter(LoginUser::enabled)
            .orElseThrow(() -> new BizException(ErrorCode.UNAUTHORIZED.getCode(), "凭证已失效"));
    TokenVersionStore.VersionSnapshot versions = user.versions();
    if (claimAsLong(jwt, "cv") != versions.credential()) {
      throw new BizException(ErrorCode.UNAUTHORIZED.getCode(), "凭证已失效");
    }
    // 旋转生效点：以 Redis SET NX 原子消费旧 refresh jti，只有一个并发请求能继续签发。
    if (jwt.getExpiresAt() == null
        || !onlineUserRegistry.tryBlacklist(
            jti, Duration.between(Instant.now(), jwt.getExpiresAt()))) {
      throw new BizException(ErrorCode.UNAUTHORIZED.getCode(), "凭证已失效");
    }
    String oldAccessJti = jwt.getClaimAsString("atj");
    if (StringUtils.hasText(oldAccessJti)) {
      onlineUserRegistry.unregister(oldAccessJti);
    }
    return issueToken(user, ip, userAgent);
  }

  /** 管理员强退所选用户的全部设备；在线条目仅用于解析用户，撤销以数据库凭证代次为准。 */
  @Transactional
  public void kickUser(String jti) {
    String username =
        onlineUserRegistry
            .find(jti)
            .orElseThrow(() -> new BizException(ErrorCode.NOT_FOUND.getCode(), "在线条目已失效，请刷新列表后重试"))
            .username();
    revokeAllSessions(username);
  }

  /** 主动注销采用持久化凭证代次，可靠撤销该用户全部 access/refresh token；Redis 在线条目同步清理，仅作为快速路径和在线视图。 */
  @Transactional
  public void logout(Jwt accessToken) {
    if (accessToken == null
        || !TOKEN_TYPE_ACCESS.equals(accessToken.getClaimAsString("type"))
        || !StringUtils.hasText(accessToken.getSubject())) {
      throw new BizException(ErrorCode.UNAUTHORIZED.getCode(), "凭证已失效");
    }
    revokeAllSessions(accessToken.getSubject());
  }

  private void revokeAllSessions(String username) {
    tokenVersionStore.invalidateCredential(username);
    try {
      onlineUserRegistry.kickAll(username);
    } catch (RuntimeException e) {
      // Redis 只是在线视图/快速清理路径；故障不能回滚 PostgreSQL 中已经递增的撤销代次。
      log.warn("凭证撤销已写入当前事务，但 Redis 在线会话清理失败: {}", e.getMessage());
    }
  }

  /**
   * 用户令牌对：access token 的 {@code authorities} claim = permissions 原样 + roles 加 {@code ROLE_} 前缀； 不带
   * scope claim（scope 仅用于 client 令牌，见 {@link #issueClientToken}）。access {@code jti} 用于在线注册与黑名单强退；
   * refresh token 独立 jti + {@code type=refresh} claim + {@code atj} 关联 access jti（旋转时注销旧在线条目），
   * 不携带权限。
   */
  private TokenResponse issueToken(LoginUser user, String ip, String userAgent) {
    Instant now = Instant.now();
    long ttlSeconds = securityProperties.getJwt().getTtlMinutes() * 60;
    String accessJti = UUID.randomUUID().toString();
    List<String> authorities = new ArrayList<>(user.permissions());
    user.roles().stream().map(role -> "ROLE_" + role).forEach(authorities::add);
    TokenVersionStore.VersionSnapshot versions = user.versions();
    JwtClaimsSet accessClaims =
        JwtClaimsSet.builder()
            .issuer(securityProperties.getJwt().getIssuer())
            .audience(List.of(securityProperties.getJwt().getAudience()))
            .subject(user.username())
            .id(accessJti)
            .issuedAt(now)
            .expiresAt(now.plusSeconds(ttlSeconds))
            .claim("type", TOKEN_TYPE_ACCESS)
            .claim("uid", user.id())
            .claim("authorities", authorities)
            .claim("av", versions.globalAuthorization())
            .claim("uv", versions.userAuthorization())
            .claim("cv", versions.credential())
            .build();
    String refreshJti = UUID.randomUUID().toString();
    JwtClaimsSet refreshClaims =
        JwtClaimsSet.builder()
            .issuer(securityProperties.getJwt().getIssuer())
            .audience(List.of(securityProperties.getJwt().getAudience()))
            .subject(user.username())
            .id(refreshJti)
            .issuedAt(now)
            .expiresAt(now.plus(Duration.ofDays(securityProperties.getJwt().getRefreshTtlDays())))
            .claim("type", TOKEN_TYPE_REFRESH)
            .claim("uid", user.id())
            .claim("atj", accessJti)
            .claim("cv", versions.credential())
            .build();
    onlineUserRegistry.register(accessJti, refreshJti, user.username(), ip, userAgent);
    return new TokenResponse(encode(accessClaims), encode(refreshClaims), "Bearer", ttlSeconds);
  }

  /** 当前失败计数（key 不存在视为 0）。 */
  private long failCount(String failKey) {
    String value = stringRedisTemplate.opsForValue().get(failKey);
    return value == null ? 0 : Long.parseLong(value);
  }

  /** 记录一次失败：INCR 计数，首次失败设置窗口 TTL（后续失败不顺延）。 */
  private void recordFailure(String failKey) {
    Long count = stringRedisTemplate.opsForValue().increment(failKey);
    if (count != null && count == 1L) {
      stringRedisTemplate.expire(failKey, FAIL_WINDOW);
    }
  }

  private String encode(JwtClaimsSet claims) {
    JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
    return jwtEncoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
  }

  private static long claimAsLong(Jwt jwt, String name) {
    Object value = jwt.getClaim(name);
    return value instanceof Number number ? number.longValue() : -1L;
  }

  private static boolean secretsEqual(String expected, String actual) {
    if (expected == null || actual == null) {
      return false;
    }
    return MessageDigest.isEqual(
        expected.getBytes(StandardCharsets.UTF_8), actual.getBytes(StandardCharsets.UTF_8));
  }
}
