package io.apocalypse.framework.security;

import java.util.Collection;

import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2ErrorCodes;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.util.StringUtils;

/** 三类 JWT 的 fail-closed claim 契约。签名通过但身份形态不完整的令牌不得进入 SecurityContext。 */
final class JwtContractValidator implements OAuth2TokenValidator<Jwt> {

  private static final OAuth2TokenValidatorResult INVALID =
      OAuth2TokenValidatorResult.failure(
          new OAuth2Error(OAuth2ErrorCodes.INVALID_TOKEN, "JWT claim contract is invalid", null));

  private final String audience;

  JwtContractValidator(String audience) {
    this.audience = audience;
  }

  @Override
  public OAuth2TokenValidatorResult validate(Jwt jwt) {
    if (!jwt.getAudience().contains(audience)
        || !StringUtils.hasText(jwt.getSubject())
        || !StringUtils.hasText(jwt.getId())) {
      return INVALID;
    }
    String type = jwt.getClaimAsString("type");
    boolean valid =
        switch (type == null ? "" : type) {
          case "access" -> validAccess(jwt);
          case "refresh" -> validRefresh(jwt);
          case "client" -> validClient(jwt);
          default -> false;
        };
    return valid ? OAuth2TokenValidatorResult.success() : INVALID;
  }

  private static boolean validAccess(Jwt jwt) {
    Object authorities = jwt.getClaim("authorities");
    return number(jwt, "uid")
        && number(jwt, "av")
        && number(jwt, "uv")
        && number(jwt, "cv")
        && authorities instanceof Collection<?> values
        && values.stream()
            .allMatch(value -> value instanceof String text && StringUtils.hasText(text))
        && jwt.getClaim("scope") == null;
  }

  private static boolean validRefresh(Jwt jwt) {
    return number(jwt, "uid")
        && number(jwt, "cv")
        && StringUtils.hasText(jwt.getClaimAsString("atj"))
        && jwt.getClaim("authorities") == null
        && jwt.getClaim("scope") == null;
  }

  private static boolean validClient(Jwt jwt) {
    return StringUtils.hasText(jwt.getClaimAsString("scope"))
        && jwt.getClaim("uid") == null
        && jwt.getClaim("authorities") == null;
  }

  private static boolean number(Jwt jwt, String name) {
    return jwt.getClaim(name) instanceof Number;
  }
}
