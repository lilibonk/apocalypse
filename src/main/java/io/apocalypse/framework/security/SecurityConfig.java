package io.apocalypse.framework.security;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.convert.converter.Converter;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.authorization.AuthorizationManager;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.RequestAuthorizationContext;
import org.springframework.util.StringUtils;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import com.nimbusds.jose.jwk.source.ImmutableSecret;

import lombok.RequiredArgsConstructor;

/** 安全装配：无状态 JWT 资源服务器。 关闭 CSRF——本服务为纯无状态 JSON API（无 Cookie 会话），CSRF 攻击面不存在；若未来引入浏览器会话需重新开启。 */
@Configuration
@EnableMethodSecurity
@EnableConfigurationProperties(SecurityProperties.class)
@RequiredArgsConstructor
public class SecurityConfig {

  private final RestAuthenticationEntryPoint restAuthenticationEntryPoint;

  private final RestAccessDeniedHandler restAccessDeniedHandler;

  private final JwtBlacklistFilter jwtBlacklistFilter;

  /** 匿名认证入口、文档与健康检查白名单；logout 和管理端点另行授权。 */
  private static final String[] PUBLIC_ENDPOINTS = {
    "/auth/login",
    "/auth/refresh",
    "/auth/token",
    "/v3/api-docs/**",
    "/swagger-ui/**",
    "/swagger-ui.html",
    "/actuator/health"
  };

  @Bean
  public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
    http.csrf(csrf -> csrf.disable())
        // 跨域来源走 CorsConfigurationSource bean（apocalypse.security.cors.allowed-origins 配置）
        .cors(Customizer.withDefaults())
        .sessionManagement(
            session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .authorizeHttpRequests(
            authorize ->
                authorize
                    .requestMatchers(PUBLIC_ENDPOINTS)
                    .permitAll()
                    .requestMatchers("/actuator/prometheus")
                    .access(clientScope("SCOPE_management:read"))
                    .requestMatchers("/actuator/**")
                    .denyAll()
                    .anyRequest()
                    .authenticated())
        .exceptionHandling(
            handling ->
                handling
                    .authenticationEntryPoint(restAuthenticationEntryPoint)
                    .accessDeniedHandler(restAccessDeniedHandler))
        .oauth2ResourceServer(
            oauth2 ->
                oauth2.jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter())))
        // 黑名单校验需在 BearerTokenAuthenticationFilter 之后（SecurityContext 已填充 Jwt）
        .addFilterAfter(jwtBlacklistFilter, BearerTokenAuthenticationFilter.class);
    return http.build();
  }

  /**
   * JWT → 权限转换：{@code authorities} claim（用户令牌：perms 原样 + {@code ROLE_*} 角色）原样映射为
   * GrantedAuthority；{@code scope} claim（client 令牌，空格分隔）映射为 {@code SCOPE_*} 前缀权限。
   */
  @Bean
  public JwtAuthenticationConverter jwtAuthenticationConverter() {
    JwtGrantedAuthoritiesConverter scopeConverter = new JwtGrantedAuthoritiesConverter();
    Converter<Jwt, Collection<GrantedAuthority>> combinedConverter =
        jwt -> {
          Collection<GrantedAuthority> authorities = new ArrayList<>();
          String type = jwt.getClaimAsString("type");
          if ("client".equals(type)) {
            Collection<GrantedAuthority> scopes = scopeConverter.convert(jwt);
            if (scopes != null) {
              authorities.addAll(scopes);
            }
          } else if ("access".equals(type)) {
            List<String> extra = jwt.getClaimAsStringList("authorities");
            if (extra != null) {
              extra.stream()
                  .filter(StringUtils::hasText)
                  .map(SimpleGrantedAuthority::new)
                  .forEach(authorities::add);
            }
          }
          return authorities;
        };
    JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
    converter.setJwtGrantedAuthoritiesConverter(combinedConverter);
    return converter;
  }

  /** HS256 签名器。 */
  @Bean
  public JwtEncoder jwtEncoder(SecurityProperties properties) {
    return new NimbusJwtEncoder(new ImmutableSecret<>(secretKey(properties)));
  }

  /**
   * CORS 配置：允许的来源按 {@code apocalypse.security.cors.allowed-origins} 精确匹配（空列表=全部拒绝跨域）， 方法/头放开、预检缓存 1
   * 小时。认证走 Authorization Bearer 头而非 Cookie，故不开放凭证（allowCredentials=false）。
   */
  @Bean
  public CorsConfigurationSource corsConfigurationSource(SecurityProperties properties) {
    CorsConfiguration configuration = new CorsConfiguration();
    configuration.setAllowedOrigins(properties.getCors().getAllowedOrigins());
    configuration.setAllowedMethods(
        List.of("GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"));
    configuration.setAllowedHeaders(List.of("*"));
    configuration.setAllowCredentials(false);
    configuration.setMaxAge(3600L);
    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/**", configuration);
    return source;
  }

  /** HS256 验签器。 */
  @Bean
  public JwtDecoder jwtDecoder(SecurityProperties properties) {
    NimbusJwtDecoder decoder =
        NimbusJwtDecoder.withSecretKey(secretKey(properties))
            .macAlgorithm(MacAlgorithm.HS256)
            .build();
    decoder.setJwtValidator(
        new DelegatingOAuth2TokenValidator<>(
            JwtValidators.createDefaultWithIssuer(properties.getJwt().getIssuer()),
            new JwtContractValidator(properties.getJwt().getAudience())));
    return decoder;
  }

  @Bean
  public PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder();
  }

  /** HS256 要求密钥 ≥ 32 字节（256 bit），启动期即校验，避免运行期签名失败。 */
  private static SecretKey secretKey(SecurityProperties properties) {
    if (!StringUtils.hasText(properties.getJwt().getSecret())) {
      throw new IllegalStateException("apocalypse.security.jwt.secret 必须显式配置");
    }
    byte[] bytes = properties.getJwt().getSecret().getBytes(StandardCharsets.UTF_8);
    if (bytes.length < 32) {
      throw new IllegalStateException("apocalypse.security.jwt.secret 必须不少于 32 字节（HS256 要求）");
    }
    return new SecretKeySpec(bytes, "HmacSHA256");
  }

  /** 管理面只接受 type=client 且具备专用 scope 的令牌，普通用户 token 即使同名 authority 也不能进入。 */
  private static AuthorizationManager<RequestAuthorizationContext> clientScope(String authority) {
    return (authenticationSupplier, context) -> {
      var authentication = authenticationSupplier.get();
      boolean granted =
          authentication != null
              && authentication.isAuthenticated()
              && authentication.getPrincipal() instanceof Jwt jwt
              && "client".equals(jwt.getClaimAsString("type"))
              && authentication.getAuthorities().stream()
                  .anyMatch(grantedAuthority -> authority.equals(grantedAuthority.getAuthority()));
      return new AuthorizationDecision(granted);
    };
  }
}
