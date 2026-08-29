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
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;
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

  /** 登录/文档/监控白名单，其余请求一律要求认证。 */
  private static final String[] WHITE_LIST = {
    "/auth/**",
    "/v3/api-docs/**",
    "/swagger-ui/**",
    "/swagger-ui.html",
    "/actuator/health",
    "/actuator/prometheus"
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
                authorize.requestMatchers(WHITE_LIST).permitAll().anyRequest().authenticated())
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
          Collection<GrantedAuthority> authorities = new ArrayList<>(scopeConverter.convert(jwt));
          List<String> extra = jwt.getClaimAsStringList("authorities");
          if (extra != null) {
            extra.stream()
                .filter(StringUtils::hasText)
                .map(SimpleGrantedAuthority::new)
                .forEach(authorities::add);
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
    return NimbusJwtDecoder.withSecretKey(secretKey(properties))
        .macAlgorithm(MacAlgorithm.HS256)
        .build();
  }

  @Bean
  public PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder();
  }

  /** HS256 要求密钥 ≥ 32 字节（256 bit），启动期即校验，避免运行期签名失败。 */
  private static SecretKey secretKey(SecurityProperties properties) {
    byte[] bytes = properties.getJwt().getSecret().getBytes(StandardCharsets.UTF_8);
    if (bytes.length < 32) {
      throw new IllegalStateException("apocalypse.security.jwt.secret 必须不少于 32 字节（HS256 要求）");
    }
    return new SecretKeySpec(bytes, "HmacSHA256");
  }
}
