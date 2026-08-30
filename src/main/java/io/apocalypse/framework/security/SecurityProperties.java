package io.apocalypse.framework.security;

import java.util.ArrayList;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

import lombok.Getter;
import lombok.Setter;

/**
 * 安全配置属性（{@code apocalypse.security}）。 JWT 采用 HS256 对称签名起步，生产建议切 RS256（README 有指引）；secret 必须不少于 32
 * 字节，走环境变量注入。
 */
@Getter
@Setter
@ConfigurationProperties("apocalypse.security")
public class SecurityProperties {

  private Jwt jwt = new Jwt();

  /** 首次启动管理员初始化。 */
  private Bootstrap bootstrap = new Bootstrap();

  /** 服务账号（client_credentials 风格，2 期外部 Agent 接入使用）。 */
  private List<Client> clients = new ArrayList<>();

  /** CORS 跨域配置。 */
  private Cors cors = new Cors();

  @Getter
  @Setter
  public static class Jwt {

    /** HS256 密钥，至少 32 字节。 */
    private String secret;

    /** 签发方。 */
    private String issuer = "apocalypse";

    /** 目标 API audience。 */
    private String audience = "apocalypse-api";

    /** 访问令牌有效期（分钟）。 */
    private long ttlMinutes = 120;

    /** 刷新令牌有效期（天），默认 7 天。 */
    private long refreshTtlDays = 7;
  }

  @Getter
  @Setter
  public static class Bootstrap {

    /** V1 预置但默认禁用的管理员用户名。 */
    private String adminUsername = "admin";

    /** 仅首次启用 bootstrap 管理员时使用；空值表示不启用。 */
    private String adminPassword;
  }

  @Getter
  @Setter
  public static class Cors {

    /** 允许跨域的来源（精确匹配，空列表=不允许任何跨域）。 */
    private List<String> allowedOrigins = new ArrayList<>();
  }

  @Getter
  @Setter
  public static class Client {

    private String clientId;

    private String clientSecret;

    /** 授予的 scope 列表。 */
    private List<String> scopes = new ArrayList<>();
  }
}
